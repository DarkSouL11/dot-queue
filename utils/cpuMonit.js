const os = require("os");
const EventEmitter = require("events");

var CPUMonitor = {

    // Default options
    isStarted: false,
    startedAt: false,
    timespan: 500, // Default time to calculate average usage is 500ms
    delay: 1000, // Default time between for monitor cycles is 1000ms and should be > timespan
    alertValue: 85, // Emits a alert event when cpu usage exceeds this value
    alertDisabled: false, // Will not emit alert event if enabled
    monitor: null,
    // Function definitions
    resetOptions: function(){
        this.timespan = 500;
        this.delay = 1000;
        this.isStarted = false;
        this.startedAt = false;
        this.monitor = null;
        this.alertValue = 85;
        this.alertDisabled = false;
        this.cpuLimitReached = false;
    },
    getCurrentUsage: function(){
        let cpuLt = 0, idleLt = 0, cpus = os.cpus();
        for(var x in cpus){
            let cpu = cpus[x];
            idleLt += cpu.times.idle;
            for(var k in cpu.times){
                cpuLt += cpu.times[k];
            }
        }
        return {
            lifeTime: cpuLt,
            idleTime: idleLt
        }
    },
    getAverageUsage: function(){
        return new Promise((resolve, reject) => {
            // Think of similar implementation without promise as this will never be rejected
            var startMeasure = this.getCurrentUsage();
            setTimeout(() => {
                var endMeasure = this.getCurrentUsage();
                var totalTime = endMeasure.lifeTime - startMeasure.lifeTime;
                var idleTime = endMeasure.idleTime - startMeasure.idleTime;
                var cpuUsage = (1 - (idleTime/totalTime)) * 100;
                resolve(cpuUsage);
            }, this.timespan)
        })
    },
    setOptions: function(o){
        this.timespan = o.timespan || this.timespan;
        this.delay = o.delay || this.delay;
        this.alertValue = o.alertValue || this.alertValue;
        this.alertDisabled = o.alertDisabled || this.alertDisabled;
        if(this.delay < this.timespan){
            this.resetOptions();
            throw new Error('Delay should be greater than timespan');
        }
    },
    start: function(options){
        if(this.isStarted) throw new Error('Cpu monitoring is already running!');
        if(options) this.setOptions(options);
        // Log start time
        this.startedAt = new Date().getTime();
        var cpuLimitReached = false
        // Create a event emitter to emit various monitor events;
        this.monitor = new EventEmitter();
        this.isStarted = setInterval(async () => {
            let cpuUsage = await this.getAverageUsage();
            this.monitor.emit('update', cpuUsage);
            if(!this.alertDisabled && cpuUsage >= this.alertValue){
                cpuLimitReached = true;
                this.monitor.emit('alert', {cpuUsage, alertValue: this.alertValue});
            }else{
                cpuLimitReached = false;
            }
        }, this.delay)

        return {
            monitor: this.monitor,
            isCpuLimitReached: function(){
                return limitReached;
            }
        }
    },
    stop: function(){
        if(!this.isStarted) throw new Error('Cpu monitoring is not active!');
        clearInterval(this.isStarted);
        this.monitor.removeAllListeners();
        this.resetOptions();
    },
    getActiveTime: function(){
        if(!this.isStarted) return 0;
        return new Date().getTime() - this.startedAt;
    }
}

module.exports = {
    CPUMonitor
}
