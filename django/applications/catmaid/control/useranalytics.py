# -*- coding: utf-8 -*-

from datetime import timedelta, datetime
from dateutil import parser as dateparser
import io
import logging
import numpy as np
import pytz
from typing import Any, Dict, List, Tuple

from django.db import connection
from django.http import HttpRequest, HttpResponse
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.views.decorators.cache import never_cache

from catmaid.control.common import get_request_bool
from catmaid.control.authentication import requires_user_role
from catmaid.models import Connector, Project, Treenode, Review, UserRole

logger = logging.getLogger(__name__)

try:
    import matplotlib
    # Use a noninteractive backend since most CATMAID instances are headless.
    matplotlib.use('svg')

    import matplotlib.pyplot as plt
    from matplotlib.dates import  DateFormatter, DayLocator
    from pylab import figure
    from matplotlib.backends.backend_svg import FigureCanvasSVG
except ImportError:
    logger.warning("CATMAID was unable to laod the matplotlib module. "
        "User analytics will not be available")


class Bout(object):
    """ Represents one bout, based on a list of events. The first event ist the
    start date/time, the last event the end.
    """
    def __init__(self, start, end=None):
        self.events = [start]
        if end:
            self.events.append(end)

    def addEvent(self, e):
        """ Increments the event counter.
        """
        self.events.append(e)

    @property
    def nrEvents(self):
        return len(self.events)

    @property
    def start(self):
        return self.events[0]

    @property
    def end(self):
        return self.events[-1]

    def __str__(self):
        return "Bout with %s events [%s, %s]" % \
                (self.nrEvents, self.start, self.end)

@never_cache
@requires_user_role(UserRole.Browse)
def plot_useranalytics(request:HttpRequest, project_id) -> HttpResponse:
    """ Creates an SVG image containing different plots for analzing the
    performance of individual users over time.
    """
    time_zone = pytz.utc

    userid = request.GET.get('userid', None)
    if not (userid and userid.strip()):
        raise ValueError("Need user ID")
    project = get_object_or_404(Project, pk=project_id) if project_id else None
    all_writes = get_request_bool(request.GET, 'all_writes', False)
    maxInactivity = int(request.GET.get('max_inactivity', 3))

    # Get the start date for the query, defaulting to 7 days ago.
    start_date = request.GET.get('start', None)
    if start_date:
        start_date = dateparser.parse(start_date)
        start_date = time_zone.localize(start_date)
    else:
        with timezone.override(time_zone):
            start_date = timezone.now() - timedelta(7)

    # Get the end date for the query, defaulting to now.
    end_date = request.GET.get('end', None)
    if end_date:
        end_date = dateparser.parse(end_date)
        end_date = time_zone.localize(end_date)
    else:
        with timezone.override(time_zone):
            end_date = timezone.now()

    # The API is inclusive and should return stats for the end date as
    # well. The actual query is easier with an exclusive end and therefore
    # the end date is set to the beginning of the next day.
    end_date = end_date + timedelta(days=1)

    if request.user.is_superuser or \
            project and request.user.has_perm('can_browse', project):
        f = generateReport( userid, project_id, maxInactivity, start_date,
                end_date, all_writes )
    else:
        f = generateErrorImage('You lack permissions to view this report.')

    # Use raw text rather than SVG fonts or pathing.
    plt.rcParams['svg.fonttype'] = 'none'
    buf = io.BytesIO()
    plt.savefig(buf, format='svg')
    return HttpResponse(buf.getvalue(), content_type='image/svg+xml')

def eventTimes(user_id, project_id, start_date, end_date, all_writes=True) -> Dict[str, Any]:
    """ Returns a tuple containing a list of tree node edition times, connector
    edition times and tree node review times within the date range specified
    where the editor/reviewer is the given user.
    """
    dr = (start_date, end_date)
    tns = Treenode.objects.filter(
        editor_id=user_id,
        edition_time__range=dr)
    cns = Connector.objects.filter(
        editor_id=user_id,
        edition_time__range=dr)
    rns = Review.objects.filter(
        reviewer_id=user_id,
        review_time__range=dr)

    if project_id:
        tns = tns.filter(project_id=project_id)
        cns = cns.filter(project_id=project_id)
        rns = rns.filter(project_id=project_id)

    tns = tns.values_list('edition_time', flat=True)
    cns = cns.values_list('edition_time', flat=True)
    rns = rns.values_list('review_time', flat=True)

    events = {
        'treenode_events': list(tns),
        'connector_events': list(cns),
        'review_events': list(rns)
    }

    if all_writes:
        if project_id:
            params = (start_date, end_date, user_id, project_id) # type: Tuple[str, ...]
            project_filter = "AND project_id = %s"
        else:
            params = (start_date, end_date, user_id)
            project_filter = ""

        # Query transaction log. This makes this feature only useful of history
        # tracking is available.
        cursor = connection.cursor()
        cursor.execute("""
            SELECT execution_time
            FROM catmaid_transaction_info
            WHERE execution_time >= %s
            AND execution_time <= %s
            AND user_id = %s
            {}
        """.format(project_filter), params)
        events['write_events'] = [r[0] for r in cursor.fetchall()]

    return events

def eventsPerInterval(times, start_date, end_date, interval='day') -> Tuple[np.ndarray, List]:
    """ Creates a histogram of how many events fall into all intervals between
    <start_data> and <end_date>. The interval type can be day, hour and
    halfhour. Returned is a tuple containing two elemens: the histogram and a
    time axis, labeling every bin.
    """
    if interval=='day':
        intervalsPerDay = 1
        secondsPerInterval = 86400
    elif interval=='hour':
        intervalsPerDay = 24
        secondsPerInterval = 3600
    elif interval=='halfhour':
        intervalsPerDay = 48
        secondsPerInterval = 1800
    else:
        raise ValueError('Interval options are day, hour, or halfhour')

    # Generate axis
    daycount = (end_date - start_date).days
    dt = timedelta(0, secondsPerInterval)
    timeaxis = [start_date + n*dt for n in range(intervalsPerDay * daycount)]
    # Calculate bins
    timebins = np.zeros(intervalsPerDay * daycount)
    intervalsPerSecond = 1.0 / secondsPerInterval
    for t in times:
        i = int((t - start_date).total_seconds() * intervalsPerSecond)
        timebins[i] += 1

    return timebins, timeaxis

def activeTimes(alltimes, gapThresh):
    """ Goes through the sorted array of time differences between all events
    stored in <alltimes>. If two events are closer together than <gapThresh>
    minutes, they are counted as events within one bout. A tuple containing a
    list of bout start dates as well as a list with total numbers of events for
    each bout is returned.
    """
    # Sort all events and create a list of (time) differences between them
    alltimes.sort()
    dts = np.diff(alltimes)
    # Threshold between to events to be counted as separate bouts (seconds)
    threshold = 60 * gapThresh
    # Indicates whether we are currently in a bout and since we haven't even
    # looked at the first event, we are initially not.
    bout = None
    # Go through all events
    for i, e in enumerate(alltimes):
        if i > 0 and dts[i-1].total_seconds() < threshold:
            # Increment current bout's event counter and continue with the
            # next element as long as the time difference to the next
            # element is below our threshold.
            bout.addEvent(e) # type: ignore # mypy cannot prove bout will not be None
            continue
        else:
            # Return current bout (not available in first iteration) and create
            # a new one.
            if bout:
                yield bout
            bout = Bout(e)

    # Return last bout, if it hasn't been returned, yet
    if bout:
        yield bout

def activeTimesPerDay(active_bouts):
    """ Creates a tuple containing the active time in hours for every day
    between the first event of the first bout and the last event of the last
    bout as well as a list with the date for every day.
    """
    # Return right away if there are no bouts
    if not active_bouts:
      return [], []

    # Find first event of first bout
    daystart = active_bouts[0].start.replace(
            hour=0, minute=0, second=0, microsecond=0)
    # Find last event of last bout
    dayend = active_bouts[-1].end
    # Get total number of between first event and last event
    numdays = (dayend - daystart).days + 1
    # Create a list of dates for every day between first and last event
    timeaxis = [daystart.date() + timedelta(d) for d in range(numdays)]

    # Calculate the netto active time for each day
    net_active_time = np.array(np.zeros(numdays))
    for bout in active_bouts:
        active_time = (bout.end - bout.start).total_seconds()
        net_active_time[(bout.start - daystart).days] += active_time

    # Return a tuple containing the active time for every
    # day in hours and the list of days.
    return np.divide(net_active_time, 3600), timeaxis

def singleDayEvents( alltimes, start_hour, end_hour ):
    alltimes.sort()
    timeaxis = [n for n in np.add(start_hour,range(end_hour-start_hour+1))]
    activity = np.zeros(end_hour-start_hour+1)
    for a in alltimes:
        if a.hour >= start_hour:
            if a.hour < end_hour:
                activity[a.hour-start_hour] += 1
    return np.true_divide(activity,(alltimes[-1] - alltimes[0]).days), timeaxis

def singleDayActiveness(activebouts, increment, start_hour, end_hour) -> Tuple[Any, Any]:
    """ Returns a ... for all bouts between <start_hour> and <end_hour> of the
    day.
    """
    # Return right away, when there are no bouts given
    if not activebouts:
        return [], []
    # Make sure 60 can be cleanly devided by <incement>
    if np.mod(60, increment) > 0:
        raise ValueError('Increments must divide 60 evenly')

    # Some constants
    stepsPerHour = 60 / increment
    hoursConsidered = (end_hour - start_hour) + 1
    daysConsidered = (activebouts[-1].end - activebouts[0].start).days + 1

    # Get start of current day
    starttime = timezone.now()
    # FIXME: replace doesn't replace in place, but returns a new object
    starttime.replace(hour=start_hour,minute=0,second=0,microsecond=0)
    # Create time axis list with entry for every <increment> minutes between
    # <start_hour> and <end_hour>.
    timeaxis = [starttime + timedelta(0, 0, 0, 0, n * increment) \
            for n in range(stepsPerHour * hoursConsidered)]

    # Loop through all days considered to find number of weekend days
    weekendCorrection = 0
    for d in range(daysConsidered):
        # TODO: Why is 0 and 6 used for comparison?
        saturday = (activebouts[0].start + timedelta(d)).isoweekday() == 0
        sunday = (activebouts[0].start + timedelta(d)).isoweekday() == 6
        if saturday or sunday:
            weekendCorrection += 1

    # Initialize list for minutes per period with zeros
    durPerPeriod = np.zeros(stepsPerHour * hoursConsidered)
    for bout in activebouts:
        # Ignore bouts what start after requested <end_hour> or end before
        # requested <start_hour>.
        if bout.start.hour > end_hour:
            continue
        elif bout.end.hour < start_hour:
            continue
        # Crop start and end times of every valid bout to request period
        elif bout.start.hour < start_hour:
            # FIXME: replace doesn't replace in place, but returns a new object
            bout.start.replace(hour=start_hour,minute=0,second=0,microsecond=0)
        elif bout.end.hour > end_hour:
            # FIXME: replace doesn't replace in place, but returns a new object
            bout.end.replace(hour=end_hour,minute=0,second=0,microsecond=0)

        # Go through every sub bout, defined by periods if <increment> minutes,
        # and store the number of minutes for every time-fraction considered.
        for subbout in splitBout(bout,increment):
            subboutSeconds = (subbout.end - subbout.start).total_seconds()
            i = stepsPerHour * (subbout.start.hour - start_hour) + \
                    subbout.start.minute / increment
            durPerPeriod[i] += np.true_divide(subboutSeconds, 60)

    # Divide each period (in seconds) by ?
    n = increment * (daysConsidered - weekendCorrection)
    durations = np.true_divide(durPerPeriod, n)
    # Return a tuple containing a list durations and a list of timepoints
    return durations, timeaxis

def splitBout(bout,increment) -> List[Bout]:
    """ Splits one bout in periods of <increment> minutes.
    """
    if np.mod(60, increment) > 0:
        raise RuntimeError('Increments must divide 60 evenly')

    boutListOut = []
    currtime = bout.start
    nexttime = bout.start
    while nexttime < bout.end:
        basemin = increment * ( currtime.minute / increment )
        nexttime = currtime.replace(minute=0,second=0,microsecond=0) + timedelta(0,0,0,0,basemin+increment)
        if nexttime > bout.end:
            nexttime = bout.end
        boutListOut.append(Bout(currtime, nexttime))
        currtime = nexttime
    return boutListOut

def generateErrorImage(msg):
    """ Creates an empty image (based on image nr. 1) and adds a message to it.
    """
    fig = plt.figure(1, figsize=(6,6))
    fig.clf()
    fig.suptitle(msg)
    return fig

def generateReport(user_id, project_id, activeTimeThresh, start_date, end_date, all_writes=True):
    """ nts: node times
        cts: connector times
        rts: review times """
    events = eventTimes(user_id, project_id, start_date, end_date, all_writes)

    nts = events['treenode_events']
    cts = events['connector_events']
    rts = events['review_events']

    # If no nodes have been found, return an image with a descriptive text.
    if len(nts) == 0:
        return generateErrorImage("No tree nodes were edited during the " +
                "defined period if time.")

    annotationEvents, ae_timeaxis = eventsPerInterval( nts + cts, start_date, end_date )
    reviewEvents, re_timeaxis = eventsPerInterval( rts, start_date, end_date )

    if all_writes:
        write_events = events['write_events']
        other_write_events = write_events
        writeEvents, we_timeaxis = eventsPerInterval(other_write_events, start_date, end_date)
    else:
        other_write_events = []

    activeBouts = list(activeTimes( nts+cts+rts+other_write_events, activeTimeThresh ))
    netActiveTime, at_timeaxis = activeTimesPerDay( activeBouts )

    dayformat = DateFormatter('%b %d')

    fig = plt.figure(figsize=(9.6, 8))

    # Top left plot: created and edited nodes per day
    ax1 = plt.subplot2grid((2,2), (0,0))

    # If other writes should be shown, draw accumulated write bar first. This
    # makes the regular bar draw over it, so that only the difference is
    # visible, which is exactly what we want.
    if all_writes:
        we = ax1.bar(we_timeaxis, writeEvents, color='#00AA00', align='edge')

    an = ax1.bar(ae_timeaxis, annotationEvents, color='#0000AA', align='edge')
    rv = ax1.bar(re_timeaxis, reviewEvents, bottom=annotationEvents,
            color='#AA0000', align='edge')
    ax1.set_xlim((start_date,end_date))

    if all_writes:
        ax1.legend( (we, an, rv), ('Other changes','Annotated', 'Reviewed'), loc=2)
        ax1.set_ylabel('Nodes and changes')
    else:
        ax1.legend( (an, rv), ('Annotated', 'Reviewed'), loc=2 )
        ax1.set_ylabel('Nodes')

    yl = ax1.get_yticklabels()
    plt.setp(yl, fontsize=10)
    ax1.xaxis.set_major_formatter(dayformat)
    xl = ax1.get_xticklabels()
    plt.setp(xl, rotation=30, fontsize=10)
    ax1.set_title('Edit events', fontsize=10)

    # Bottom left plot: net active time per day
    ax2 = plt.subplot2grid((2,2), (1,0))
    ax2.bar( at_timeaxis, netActiveTime, color='k', align='edge')
    ax2.set_xlim((start_date,end_date))
    ax2.set_ylabel('Hours')
    yl = ax2.get_yticklabels()
    plt.setp(yl, fontsize=10)
    ax2.xaxis.set_major_formatter(dayformat)
    xl = ax2.get_xticklabels()
    plt.setp(xl, rotation=30, fontsize=10)
    ax2.set_title('Net daily active time', fontsize=10)

    """
    ax3 = fig.add_subplot(223)
    ax3 = eventsPerIntervalPerDayPlot(ax3, rts+nts+cts, start_date, end_date, 30 )
    """

    # Right column plot: bouts over days
    ax4 = plt.subplot2grid((2,2), (0,1), rowspan=2)
    ax4 = dailyActivePlotFigure( activeBouts, ax4, start_date, end_date )

    yl = ax4.get_yticklabels()
    plt.setp(yl, fontsize=10)
    ax4.xaxis.set_major_formatter(dayformat)
    xl = ax4.get_xticklabels()
    plt.setp(xl, rotation=30, fontsize=10)
    ax4.set_title('Active Bouts', fontsize=10)
    yl = ax4.get_yticklabels()
    plt.setp(yl, fontsize=10)
    ax4.set_ylabel('Time (24 hr)')

    fig.set_tight_layout(True)

    return fig

def dailyActivePlotFigure( activebouts, ax, start_date, end_date ):
    """ Draws a plot of all bouts during each day between <start_date> and
    <end_date> to the plot given by <ax>.
    """
    # Y axis: Draw a line for each two hours in a day and set ticks accordingly
    for i in range(2, 24, 2):
        ax.axhline(i, color='#AAAAAA', linestyle = ':')
    ax.axhspan(8,18,facecolor='#999999',alpha=0.25)
    ax.set_yticks(range(0, 25, 2))

    # X axis: Ticks and labels for every day
    ax.xaxis.set_major_locator(DayLocator())

    # Draw all bouts
    for bout in activebouts:
        # Ignore bouts that span accross midnight
        # TODO: Draw midnight spanning bouts, too.
        if bout.start.day == bout.end.day:
            isodate = bout.start.isocalendar()
            ax.bar( bout.start.replace(hour=0,minute=0,second=0,microsecond=0),
                    np.true_divide((bout.end-bout.start).total_seconds(), 3600),
                    bottom=bout.start.hour + bout.start.minute/60.0 + bout.start.second/3600.0,
                    alpha=0.5, color='#0000AA', align='edge', edgecolor="k")

    # Set Axis limits
    ax.set_ylim((0, 24))
    ax.invert_yaxis()
    ax.set_xlim((start_date, end_date))

    return ax

def eventsPerIntervalPerDayPlot(ax,times,start_date,end_date,interval=60):
    if np.mod(24 * 60, interval) > 0:
        raise ValueError('Interval in minutes must divide the day evenly')

    daycount = (end_date-start_date).days
    timebins = {}

    for i in range(daycount):
        timebins[i] = np.zeros(24 * 60 / interval)

    dayList = []
    daylabels = []

    for i in range(daycount):
        day = start_date + timedelta( i )
        dayList.append( day )
        daylabels.append( str(day.month) + '/' + str(day.day) )

    timeaxis = [i for i in range(24 * 60 / interval )]
    timelabels = []
    for i in range(int(24 * 60 / 30)):
        if np.mod(i,2)==0:
            timelabels.append( str(i/2) + ':00' )
        else:
            timelabels.append( str( (i-1)/2 ) + ':30' )

    for t in times:
        timebins[np.floor((t-start_date).days)][ np.floor(np.divide(t.hour*60+t.minute, interval)) ] += 1
    meandat = np.zeros(len(timebins[0]))
    ignoredDays = 0
    ind = 0
    cm = plt.get_cmap('jet',len(timebins))
    dats = []
    for dat in timebins.values():
        if np.sum(dat)==0:
            ignoredDays += 1
        else:
           tmp, = ax.plot( timeaxis, dat, marker='s', linestyle='-.',alpha=0.5, color=cm(ind) )
           dats.append(tmp)
           meandat += dat
        ind += 1

    meandat = np.divide(meandat, daycount-ignoredDays)
    tmp,  = ax.plot( timeaxis, meandat, color='k', linewidth=4, linestyle='-')
    dats.append(tmp)
    daylabels.append('Mean')

    ax.set_xticks( timeaxis )
    ax.set_xticklabels( timelabels )
    xl = ax.get_xticklabels()
    plt.setp(xl, rotation=30, fontsize=10)
    yl = ax.get_yticklabels()
    plt.setp(yl, fontsize=10)
    ax.set_ylabel('Events',fontsize=10)
    ax.set_xlim( 8 * 60 / interval, 19 * 60 / interval )
    ax.legend(dats,daylabels,loc=2,frameon=False)

    return ax
