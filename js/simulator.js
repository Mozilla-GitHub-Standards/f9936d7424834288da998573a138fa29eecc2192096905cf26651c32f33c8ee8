function simulate(data, num_machines, time_domain) {
    /*
     * data - EXPECTING list() OF (request_time, duration) PAIRS
     * num_machines - NUMBER OF RESOURCES
     * time_domain - TIME RESOLUTION (MINUTE, HOUR, etc)
     */
    var active_machines = new PriorityQueue();    // CONTAINS (done_time, machine)
    var inactive_machines = new PriorityQueue();  // CONTAINS (done_time, machine)
    var request_queue = new PriorityQueue();      // CONTAINS (request_time, duration)
    var job_pending_queue = new Queue();          // CONTAINS (request_time, duration)

    Array.newRange(0, num_machines).forall(function (i) {
        inactive_machines.add(time_domain.min.unix(), i);
    });
    data.forall(function (d) {
        request_queue.add(d[0], d[1]);
    });

    // FOR EACH INTERVAL CALCULATE WHAT'S HAPPENING
    var values = {
        timestamp: [],
        active: [],
        new: [],
        pending: [],
        average_wait_time: []
    };


    Date.range(time_domain).forall(function (t) {
        var timestamp = t.unix();

        // POP OFF MACHINES THAT ARE DONE
        var done_machines = pop_until(active_machines, timestamp);
        inactive_machines.extend(done_machines);

        // ADD REQUESTS TO THE PENDING QUEUE
        var new_requests = pop_until(request_queue, timestamp);
        job_pending_queue.extend(new_requests);


        while(inactive_machines.size()>0 && job_pending_queue.size()>0){
            var requestPair=job_pending_queue.pop();
            if (!requestPair) break;
            var requestTime = requestPair[0];
            var duration = requestPair[1];
            if (requestTime>timestamp){
                job_pending_queue.push(requestPair);
                break;
            }//endif

            var availablePair=inactive_machines.pop();
            if (!availablePair){
                job_pending_queue.push(requestPair);
                break;
            }//endif
            var availableTime = availablePair[0];
            var machine = availablePair[1];
            var finishTime = aMath.max(availableTime, requestTime) + duration;
            if (finishTime>timestamp) {
                active_machines.add(finishTime, machine);
            }else{
                inactive_machines.add(finishTime, machine);
            }//endif
        }//while

        // PENDING QUEUE STATS
        var num_active = active_machines.size();
        var num_pending = job_pending_queue.size();
        var queue_sample = job_pending_queue.toArray();
        var average = 0;
        if (queue_sample.length) {
            average = timestamp - aMath.SUM(queue_sample.select(0)) / queue_sample.length;
        }//endif

        values.timestamp.append(timestamp);
        values.active.append(num_active);
        values.new.append(new_requests.length);
        values.pending.append(num_pending);
        values.average_wait_time.append(average / 60);
    });

    var timeSeries={
        "select":{"name":"average_wait_time"},
        "edges":[{
            "name":"time",
            "domain":{
                "type":"time",
                "min":time_domain.min,
                "max":time_domain.max,
                "interval":time_domain.interval,
                "partitions":Date.range(time_domain).map(function(d, i){
                    return {"value":d, "min":d, "dataIndex":i};
                })
            }
        }],
        "data":values
    };

    aChart.show({
        id: "simulated_wait_times",
        type: "line",
        stacked: false,
        width: 800,
        height: 200,
        cube: timeSeries,
        legendPosition: "left",
        legendSize: 100,
        xAxisSize: 50,
        extensionPoints: {
            line_lineWidth: 2
        }
    });

    aChart.show({
        id: "simulated_queue_size",
        type: "line",
        stacked: false,
        width: 800,
        height: 200,
        cube: Map.copy({"select":{"name":"pending"}}, timeSeries),
        legendPosition: "left",
        legendSize: 100,
        xAxisSize: 50,
        extensionPoints: {
            line_lineWidth: 2
        }
    })

}//function


function pop_until(queue, timestamp) {
    /*
     * POP (timestamp, item) PAIRS OFF THE QUEUE UP TO THE timestamp POINT
     */
    var output = [];
    while (true) {
        var pair = queue.pop();
        if (!pair) return output;
        var pairTimestamp = pair[0];
        var pairValue = pair[1];

        if (pairTimestamp > timestamp) {
            queue.push(pairTimestamp, pairValue);
            return output;
        }//endif
        output.append([pairTimestamp, pairValue]);
    }//while
}//function


function collect_day(date_range, poolFilter) {
    Thread.run(function*(){
        var response = yield (search({
            "from": "jobs",
            "select": [
                {"name": "request_time", "value": "action.request_time"},
                {"name": "duration", "value": {"add": ["action.duration", 120]}}
            ],
            "where": {
                "and": [
                    poolFilter,
                    {"gte": {"action.request_time": date_range.min.unix()}},
                    {"lt": {"action.request_time": date_range.max.unix()}}
                ]
            },
            "format": "table",
            "limit": 100000
        }));

        var data = response.data;
        simulate(data, 200, date_range);
    });
}//function



function show_history(dateRange, poolFilter){

    Thread.run(function*(){
        //WAIT TIMES
        var rawWaitTimes=yield(search({
            "from":"jobs",
            "select":[
                {"name": "start_time", "value": "action.start_time"},
                {"name": "request_time", "value": "action.request_time"}
            ],
            "where": {
                "and": [
                    {"gte": {"action.start_time": dateRange.min.unix()}},
                    {"lt": {"action.request_time": dateRange.max.unix()}},
                    poolFilter,
                    {"gt": [{"sub": ["action.start_time", "action.request_time"]}, 1]}
                ]
            },
            "format": "list",
            "limit": 10000
        }));

        var parts = Date.range(dateRange).map(function(d){
            return {"value":d, "min":d};
        });
        var waitTimes=Date.range(dateRange).map(function(d){
            var totalWait=0;
            var numWait=0.0;
            d= d.unix();
            rawWaitTimes.data.forall(function(w){
                if (w.request_time <= d && d < w.start_time){
                    totalWait+=d- w.request_time;
                    numWait++;
                }//endif
            });
            if (numWait) return totalWait/numWait/60;
            return 0;
        });


        aChart.show({
            id: "history_wait_times",
            type: "line",
            stacked: false,
            width: 800,
            height: 200,
            cube: {
                "select":{"name":"waitTime"},
                "edges":[{
                    "name":"date",
                    "domain":{"type":"time", "partitions":parts}
                }],
                "data":{"waitTime":waitTimes}
            },
            legendPosition: "left",
            legendSize: 100,
            xAxisSize: 50,
            extensionPoints: {
                line_lineWidth: 2
            }
        });

    });

    Thread.run(function*() {
        //QUEUE SIZE
        var queueSize = yield(search({
            "from": "jobs",
            "edges": [
                {
                    "name": "timestamp",
                    "range": {"min": "action.request_time", "max": "action.start_time"},
                    "domain": {
                        "type": "time",
                        "min": dateRange.min.unix(),
                        "max": dateRange.max.unix(),
                        "interval": dateRange.interval.seconds()
                    }
                }
            ]
        }));

        aChart.show({
            id: "history_queue_size",
            type: "bar",
            stacked: false,
            width: 200,
            height: 200,
            cube: queueSize,
            legendPosition: "left",
            legendSize: 100,
            xAxisSize: 50,
            extensionPoints: {
                line_lineWidth: 2
            }
        });

    });

    Thread.run(function*(){
        //RUN TIMES
        var durations = yield (search({
            "from": "jobs",
            "edges": [{
                "name": "duration",
                "value": {"div": {"action.duration": 60}},
                "domain": {
                    "type": "duration",
                    "min": 0,
                    "max": 60,
                    "interval": 1
                }
            }],
            "where": {
                "and": [
                    {"gte": {"action.start_time": dateRange.min.unix()}},
                    {"lt": {"action.start_time": dateRange.max.unix()}},
                    poolFilter
                ]
            },
            "limit": 10000
        }));

        aChart.show({
            id: "durations",
            type: "bar",
            stacked: false,
            width: 400,
            height: 200,
            cube: durations,
            legendPosition: "left",
            legendSize: 100,
            xAxisSize: 50,
            extensionPoints: {
                line_lineWidth: 2
            }
        });

    });
}


function block_size(date_range, poolFilter) {
    Thread.run(function*(){
        var response = yield (search({
            "from": "jobs",
            "groupby": [{"name": "request_time", "value": "action.request_time"}],
            "where": {
                "and": [
                    poolFilter,
                    {"gte": {"action.request_time": date_range.min.unix()}},
                    {"lt": {"action.request_time": date_range.max.unix()}}
                ]
            },
            "format": "list",
            "limit": 100000
        }));

        //FIND CONTIGUIOUS BLOCKS OF REQUESTS
        response.data = qb.sort(response.data, "request_time");
        response.data.forall(function (curr, i) {
            if (i==0) return;
            var prev = response.data[i - 1];
            if (prev.request_time == curr.request_time - 1) {
                curr.count += prev.count;
                prev.count = 0;
            }//endif
        });

        var blockSizeCount = yield (Q({
            "select": {"name":"count", "aggregate":"count"},
            "from": response.data,
            "edges": [
                {"name": "block_size", "value": "count", "allowNulls": false, "domain": {"type": "count", "min": 1, "max": 60}}
            ]
        }));

        aChart.show({
            id: "block_size",
            type: "bar",
            stacked: false,
            width: 400,
            height: 200,
            cube: blockSizeCount,
            legendPosition: "left",
            legendSize: 100,
            xAxisSize: 50,
            extensionPoints: {
                line_lineWidth: 2
            }
        })

    });


}//function


function interJobEstimate(date_range){
    //GET ALL WAITING JOBS
    Thread.run(function*() {
        var response = yield (search({
            "from": "jobs",
            "select":[
                {"name":"machine", "value":"run.machine.name"},
                {"name":"request_time", "value":"action.request_time"},
                {"name":"start_time", "value":"action.start_time"},
                {"name":"end_time", "value":"action.end_time"}
            ],
            "where": {
                "and": [
                    poolFilter,
                    {"gte": {"action.start_time": date_range.min.unix()}},
                    {"lt": {"action.request_time": date_range.max.unix()}}
                ]
            },
            "format": "list",
            "limit": 100000
        }));


        //UNION WAIT TIMES
        var waiting = new Cover();
        response.data.forall(function(d){
            if (d.start_time > d.request_time + 60) {
                waiting.add(d.request_time, d.start_time);
            }//endif
        });

        var timeToNextJob=[];
        qb.groupby(response.data, "machine").forall(function(pair){
            var machine=pair[0];
            var actions=pair[1];
            actions = qb.sort(actions, "start_time");
            actions.forall(function(a, i){
                if (i==0) return;
                var end_time=actions[i-1].end_time;
                if (waiting.excludes(end_time, a.start_time)){
                    timeToNextJob.append({"machine":machine, "restart_time":(a.start_time - end_time)*1000});
                }//endif
            });
        });

        var interJobTiming = yield (Q({
            "select": {"name": "count", "aggregate": "count"},
            "from": timeToNextJob,
            "edges": [
                {
                    "name": "restart_time",
                    "value": "restart_time",
                    "allowNulls": false,
                    "domain": {"type": "duration", "min": 0, "max": 5*60*1000, "interval": 15000}
                }
            ]
        }));

        aChart.show({
            id: "inter_job_timing",
            type: "bar",
            stacked: false,
            width: 400,
            height: 200,
            cube: interJobTiming,
            legendPosition: "left",
            legendSize: 100,
            xAxisSize: 50,
            extensionPoints: {
                line_lineWidth: 2
            }
        })



    });


}//function




function Cover(){
    this.parts=[];  // HOLDS [min, max] PAIRS
}//function


Cover.prototype.add=function(min, max){
    for(var i=0;i<this.parts.length;i++){
        var p=this.parts[i];
        if (p[0]<=min && min <=p[1]){
            this.parts.remove(p);
            this.add(p[0], Math.max(p[1], max));
            return;
        }else if (p[0]<=max && max<=p[1]){
            this.parts.remove(p);
            this.add(Math.min(p[0], min), p[1]);
            return;
        }//endif
    }//for
    this.parts.append([min, max]);
};//function

Cover.prototype.contains=function(min, max){
    // RETURN true IF this FULLY COVERS GIVEN RANGE
    for(var i=0;i<this.parts.length;i++) {
        var p = this.parts[i];
        if (p[0] <= min && max <= p[1]) return true;
    }//for
    return false;
};//function

Cover.prototype.excludes=function(min, max){
    // RETURN true IF this HAS NO OVERLAP WITH GIVEN RANGE
    for(var i=0;i<this.parts.length;i++) {
        var p = this.parts[i];
        if (p[1] <= min || max <= p[0]) return true;
    }//for
    return false;
};//function



function PriorityQueue(){
    this.list=[];
}//function

PriorityQueue.prototype.pop=function(){
    if (this.list.length==0) return null;
    var output = this.list[0];
    this.list=this.list.splice(1);
    return output;
};//funciton

PriorityQueue.prototype.add=function(priority, value){
    var list = this.list;
    var length = list.length;
    var i=0;
    for(;i<length;i++) {
        var pair = list[i];
        if (priority > pair[0]) continue;
        break;
    }
    list.insert(i, [priority, value]);
    return this;
};//function

PriorityQueue.prototype.push=PriorityQueue.prototype.add;


PriorityQueue.prototype.extend=function(pairs) {
    var self=this;
    pairs.forall(function (d) {
        self.add(d[0], d[1]);
    });
};//function

PriorityQueue.prototype.size=function(){
    return this.list.length;
};//function


PriorityQueue.prototype.toArray=function(){
    return this.list.copy();
};//function


function Queue(){
    this.list=[];
}//function

Queue.prototype.pop=function(){
    if (this.list.length==0) return null;
    var output = this.list[0];
    this.list=this.list.splice(1);
    return output;
};//funciton

Queue.prototype.add=function(value){
    this.list.append(value);
    return this;
};//function

Queue.prototype.push=function(value){
    this.list.insert(0, value);
    return this;
};//function


Queue.prototype.extend=function(values) {
    this.list.extend(values);
};//function

Queue.prototype.size=function(){
    return this.list.length;
};//function


Queue.prototype.toArray=function(){
    return this.list.copy();
};//function
