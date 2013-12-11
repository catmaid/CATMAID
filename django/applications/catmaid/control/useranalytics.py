from django.http import HttpResponse
from django.db.models import Count

from catmaid.models import *
from catmaid.objects import *
from catmaid.control.user_evaluation import _parse_date

from datetime import timedelta, time

import numpy as np
import copy

try:
    import matplotlib.pyplot as plt
    import matplotlib.colors as colors
    from matplotlib.dates import  DateFormatter, DayLocator
    from pylab import figure, axes, pie, title
    from matplotlib.backends.backend_agg import FigureCanvasAgg
except:
    pass

def plot_useranalytics(request):

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
    tns = Treenode.objects.filter(
        editor_id = user_id,
        edition_time__range = (start_date, end_date)).values_list('edition_time')
    cns = Connector.objects.filter(
        editor_id = user_id,
        edition_time__range = (start_date, end_date)).values_list('edition_time')
    rns = Treenode.objects.filter(
        reviewer_id = user_id,
        review_time__range = (start_date, end_date)).values_list('review_time')
    return [t[0] for t in tns], [t[0] for t in cns], [t[0] for t in rns]    
    
def eventsPerInterval(times, start_date, end_date, interval='day'):
    daycount = (end_date - start_date).days
    timeaxis = []
    if interval=='day':
        timebins = np.zeros( daycount )
        for n in xrange( daycount ):
            timeaxis.append( start_date + timedelta(n) )
        for t in times:
            timebins[ (t - start_date).days ] += 1
            
    elif interval=='hour':
        timebins = np.zeros( 24*daycount )
        for n in xrange( 24*daycount ):
            timeaxis.append( start_date + n*timedelta(0,3600) )
        for t in times:
            timebins[ np.floor(np.divide((t - start_date).total_seconds(),3600)) ] += 1
    
    elif interval=='halfhour':
        timebins = np.zeros( 48*daycount )
        for n in xrange( 48*daycount ):
            timeaxis.append( start_date + n*timedelta(0,1800) )
        for t in times:
            timebins[ np.floor(np.divide((t - start_date).total_seconds(),1800)) ] += 1

    else:
        print('Options are day, hour, or halfhour')
        return
    
    return timebins, timeaxis
       
def activeTimes( alltimes, gapThresh ):
    alltimes.sort()
    dts = np.diff(alltimes)
    active_times = []
    ind = 0
    active_bouts = []
    events_in_bout = []
    active_bouts.append([])
    activerun = False
    for i, dt in enumerate(dts):
        if dt.total_seconds() < 60 * gapThresh:
            if activerun == False:
                active_bouts[ind].append(alltimes[i])
                activerun = True
                events_in_bout.append( 1 )
            else:
                events_in_bout[-1] += 1
        else:
            if activerun == True:
                activerun = False
                active_bouts[ind].append(alltimes[i-1])
                ind += 1
                active_bouts.append([])
    if len(active_bouts[-1])==1:
        active_bouts[-1].append( alltimes[-1] )
    return active_bouts, events_in_bout
    
def activeTimesPerDay(active_bouts):
    daystart = active_bouts[0][0].replace(hour=0,minute=0,second=0,microsecond=0)
    dayend = active_bouts[-1][1]
    numdays = (dayend-daystart).days+1
    timeaxis = [daystart.date()+timedelta(d) for d in range(numdays)]
    
    net_active_time = np.array(np.zeros(numdays))
    for bout in active_bouts:
        net_active_time[ (bout[0]-daystart).days ] += (bout[1]-bout[0]).total_seconds()
    return np.divide(net_active_time,3600), timeaxis

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
    if np.mod(60,increment)>0:
        print 'Increments must divide 60 evenly'
        return
    starttime = datetime.now()
    starttime.replace(hour=start_hour,minute=0,second=0,microsecond=0)
    timeaxis = [starttime + timedelta(0,0,0,0,n*increment) for n in range(60/increment*(end_hour - start_hour+1))]
    durPerPeriod = np.zeros((60/increment)*(end_hour-start_hour+1))
    daysConsidered = (activebouts[-1][1]-activebouts[0][0]).days+1
    weekendCorrection = 0
    for d in range(daysConsidered):
        if (activebouts[0][0]+timedelta(d)).isoweekday() == 0 or (activebouts[0][0]+timedelta(d)).isoweekday() == 6:
            weekendCorrection += 1
    
    for bout in activebouts:
        if bout[0].hour > end_hour:
            continue
        elif bout[1].hour < start_hour:
            continue
        elif bout[0].hour < start_hour:
            bout[0].replace(hour=start_hour,minute=0,second=0,microsecond=0)
        elif bout[1].hour > end_hour:
            bout[1].replace(hour=end_hour,minute=0,second=0,microsecond=0)
            
        for subbout in splitBout(bout,increment):
            durPerPeriod[(60/increment) * (subbout[0].hour-start_hour)+ subbout[0].minute/increment] += np.true_divide((subbout[1]-subbout[0]).total_seconds(), 60)
    return np.true_divide(durPerPeriod,increment * (daysConsidered-weekendCorrection) ), timeaxis
                    
def splitBout(bout,increment):
    if np.mod(60,increment)>0:
        print 'Increments must divide 60 evenly'
        return
    
    boutListOut = []
    currtime = bout[0]
    nexttime = bout[0]
    while nexttime < bout[1]:
        basemin = increment * ( currtime.minute / increment )
        nexttime = currtime.replace(minute=0,second=0,microsecond=0) + timedelta(0,0,0,0,basemin+increment)
        if nexttime > bout[1]:
            nexttime = bout[1]
        boutListOut.append([currtime, nexttime])
        currtime = nexttime    
    return boutListOut

def generateReport( user_id, activeTimeThresh, start_date, end_date ):
    """ nts: node times
        cts: connector times
        rts: review times """
    # start_date = datetime.now() - timedelta( 7 + datetime.now().isoweekday() )
#     end_date = datetime.now()
#     

    nts, cts, rts = eventTimes( user_id, start_date, end_date )

    if len(nts) == 0:
        return figure(1, figsize=(6,6))
    
    annotationEvents, ae_timeaxis = eventsPerInterval( nts + cts, start_date, end_date )
    reviewEvents, re_timeaxis = eventsPerInterval( rts, start_date, end_date )

    activeBouts, eventsInBout = activeTimes( nts+cts+rts, activeTimeThresh )
    netActiveTime, at_timeaxis = activeTimesPerDay( activeBouts )

    activeFraction, daytimeaxis = singleDayActiveness( activeBouts, 30, 8, 20 )

    dayformat = DateFormatter('%b %d')

    fig = plt.figure(figsize=(12,10))
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

    ax4 = plt.subplot2grid((2,2), (0,1), rowspan=2)
    ax4 = dailyActivePlotFigure( activeBouts, ax4, start_date, end_date )
    ax4.xaxis.set_major_locator(DayLocator())
    
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

    today = datetime.now().isocalendar()

    for i in range(12):
        ax.axhline( 2*i, color='#AAAAAA', linestyle = ':' )
    ax.axhspan(8,18,facecolor='#999999',alpha=0.25)
    ax.set_yticks([0,2,4,6,8,10,12,14,16,18,20,22,24])
    for bout in activebouts:
        if bout[0].day == bout[1].day:
            isodate = bout[0].isocalendar()
            daybegin = copy.copy(bout[0])
            daybegin.replace(hour=0,minute=0,second=0,microsecond=0)
            ax.bar( bout[0].replace(hour=0,minute=0,second=0,microsecond=0), np.true_divide( (bout[1]-bout[0]).total_seconds(), 3600 ),
                bottom= bout[0].hour+ bout[0].minute/60.0 + bout[0].second/3600.0,alpha=0.5,color='#0000AA')
    ax.set_ylim((0,24))
    ax.set_xlim((start_date,end_date))
    timeaxis = []
    for d in range( (end_date-start_date).days ):
        timeaxis.append(start_date + timedelta(d) )

    return ax


def eventsPerIntervalPerDayPlot(ax,times,start_date,end_date,interval=60):
    if np.mod(24*60,interval) > 0:
        print('Interval in minutes must divide the day evenly')
        return
        
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
