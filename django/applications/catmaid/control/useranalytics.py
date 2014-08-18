from django.http import HttpResponse
from django.db.models import Count

from catmaid.models import *
from catmaid.objects import *
from catmaid.control.user_evaluation import _parse_date

from datetime import timedelta, time

import numpy as np
import copy

try:
    # Because we don't want to show generated images in a window, we can use
    # the Agg backend. This avoids some potential threading issues.
    import matplotlib
    matplotlib.use('Agg')

    import matplotlib.pyplot as plt
    import matplotlib.colors as colors
    from matplotlib.dates import  DateFormatter, DayLocator
    from pylab import figure, axes, pie, title
    from matplotlib.backends.backend_agg import FigureCanvasAgg
except:
    pass

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

def plot_useranalytics(request):
    """ Creates a PNG image containing different plots for analzing the
    performance of individual users over time.
    """
    userid = request.GET.get('userid', -1)
    start_date = request.GET.get('start')
    end_date = request.GET.get('end')

    print userid, start_date, end_date

    if request.user.is_superuser:
        end = _parse_date(end_date) if end_date else datetime.now()
        start = _parse_date(start_date) if start_date else end - timedelta(end.isoweekday() + 7)
        f = generateReport( userid, 10, start, end )
    else:
        f = figure(1, figsize=(6,6))

    canvas = FigureCanvasAgg( f )
    response = HttpResponse(content_type='image/png')
    canvas.print_png(response)
    return response

def eventTimes(user_id, start_date, end_date):
    """ Returns a tuple containing a list of tree node edition times, connector
    edition times and tree node review times within the date range specified
    where the editor/reviewer is the given user.
    """
    dr = (start_date, end_date)
    tns = Treenode.objects.filter(
        editor_id = user_id,
        edition_time__range=dr).values_list('edition_time', flat=True)
    cns = Connector.objects.filter(
        editor_id = user_id,
        edition_time__range=dr).values_list('edition_time', flat=True)
    rns = Review.objects.filter(
        reviewer_id = user_id,
        review_time__range=dr).values_list('review_time', flat=True)

    return list(tns), list(cns), list(rns)

def eventsPerInterval(times, start_date, end_date, interval='day'):
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
    timeaxis = [start_date + n*dt for n in xrange(intervalsPerDay * daycount)]
    # Calculate bins
    timebins = np.zeros(intervalsPerDay * daycount)
    intervalsPerSecond = 1.0 / secondsPerInterval
    for t in times:
        i = int((t - start_date).total_seconds() * intervalsPerSecond)
        timebins[i] += 1
    
    return timebins, timeaxis

def activeTimes( alltimes, gapThresh ):
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
            bout.addEvent(e)
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
    
def singleDayActiveness( activebouts, increment, start_hour, end_hour ):
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
    starttime = datetime.now()
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
                    
def splitBout(bout,increment):
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

def generateReport( user_id, activeTimeThresh, start_date, end_date ):
    """ nts: node times
        cts: connector times
        rts: review times """
    nts, cts, rts = eventTimes( user_id, start_date, end_date )

    # If no nodes have been found, return an image with a descriptive text.
    if len(nts) == 0:
        return generateErrorImage("No tree nodes were edited during the " +
                "defined period if time.")
    
    annotationEvents, ae_timeaxis = eventsPerInterval( nts + cts, start_date, end_date )
    reviewEvents, re_timeaxis = eventsPerInterval( rts, start_date, end_date )

    activeBouts = list(activeTimes( nts+cts+rts, activeTimeThresh ))
    netActiveTime, at_timeaxis = activeTimesPerDay( activeBouts )

    dayformat = DateFormatter('%b %d')

    fig = plt.figure(figsize=(12,10))

    # Top left plot: created and edited nodes per day
    ax1 = plt.subplot2grid((2,2), (0,0))
    an = ax1.bar( ae_timeaxis, annotationEvents, color='#0000AA')
    rv = ax1.bar( re_timeaxis, reviewEvents, bottom=annotationEvents, color='#AA0000')
    ax1.set_xlim((start_date,end_date))
    
    ax1.legend( (an, rv), ('Annotated', 'Reviewed'), loc=2,frameon=False )
    ax1.set_ylabel('Nodes')
    yl = ax1.get_yticklabels()
    plt.setp(yl, fontsize=10)
    ax1.xaxis.set_major_formatter(dayformat)
    xl = ax1.get_xticklabels()
    plt.setp(xl, rotation=30, fontsize=10)
    ax1.set_title('Edit events', fontsize=10)

    # Bottom left plot: net active time per day
    ax2 = plt.subplot2grid((2,2), (1,0))
    ax2.bar( at_timeaxis, netActiveTime, color='k')
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
    
    return fig
    
def dailyActivePlotFigure( activebouts, ax, start_date, end_date ):
    """ Draws a plot of all bouts during each day between <start_date> and
    <end_date> to the plot given by <ax>.
    """
    # Y axis: Draw a line for each two hours in a day and set ticks accordingly
    for i in range(12):
        ax.axhline(2 * i, color='#AAAAAA', linestyle = ':')
    ax.axhspan(8,18,facecolor='#999999',alpha=0.25)
    ax.set_yticks([0,2,4,6,8,10,12,14,16,18,20,22,24])

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
                    alpha=0.5, color='#0000AA')

    # Set Axis limits
    ax.set_ylim((0, 24))
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
    for i in range(24 * 60 / 30):
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
