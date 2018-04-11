var CPUMonitor = require('./cpuMonit');
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;
var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectId;
var MongoOplog = require('mongo-oplog');

var DotQ = {
    queueCreated: false,
    maxWorkers: numCPUs,
    mongodbClient: false,
    collection: 'dot_queue',
    jobHandlers: {},
    activeWorkers: [],
    addedJob: false,
    definedJob: false,
    maxCPUUsage: 75,
    jobInProgress: false,
    cpuMonitor: false,
    resetOptions: function(){
        this.maxWorkers = numCPUs;
        this.jobHandlers = {};
        this.collection = 'dot_queue';
        this.maxCPUUsage = 75;
        // Important to stop listeners and interval
        if(this.cpuMonitor) CPUMonitor.stop();
        this.cpuMonitor = false;
    },
    setOptions: function(o){
        this.maxWorkers = o.maxWorkers || this.maxWorkers;
        this.collection = o.collection || this.collection;
        this.maxCPUUsage = o.maxCPUUsage || this.maxCPUUsage;
        if(this.maxWorkers < 0){
            this.resetOptions();
            throw new Error(`Max workers should not be less than 0`);
        }
    },
    connectDB: async function(str){
        try{
            this.mongodbClient = await MongoClient.connect(str);
        }catch(err){
            console.log(err);
            throw new Error('Failed to connect to mongo.')
        }
    },
    create: function(options, connectionStr){
        return new Promise(async (resolve, reject) => {
            try{
                if(this.queueCreated) return reject({error_message: 'Queue already created!'});
                if(options) this.setOptions(options);
                await this.connectDB(connectionStr);
                this.queueCreated = true;
                this.jobCollection = this.mongodbClient.collection(this.collection);
                this.cpuMonitor = CPUMonitor.start({
                    delay: 3000,
                    alertValue: this.maxCPUUsage
                })
                await this.addDBHooks(connectionStr);
                resolve();
            }catch(err){
                reject({error_message: err.message});
            }
        })
    },
    defineJob: function(jobName, action){
        if(this.addedJob) throw new Error('Cannot add and define job in same process.');
        if(typeof action != 'function') throw new Error('Job should be a function.');
        if(!this.queueCreated) throw new Error('Create a queue before defining any job!');

        this.jobHandlers[jobName] = action;
        this.processJobs();
    },
    // Add job optional job priority feature
    addJob: function(jobName, data, priority){
        if(this.definedJob) throw new Error('Cannot add and define job in same process.');
        // Default priority is 5 assign higher priority for tasks to process them first or lower priority to process them late.
        priority = priority || 5;
        return new Promise(async (resolve, reject) => {
            if(!this.queueCreated) return reject({error_message: 'Create a queue before adding any job!'});
            try{
                await this.jobCollection.insert({
                    name: jobName,
                    data,
                    queueAt: new Date().getTime(),
                    status: 'queued',
                    priority
                })
                resolve();
            }catch(err){
                reject({...err, error_message: 'MonogoDB error!'})
            }
        })
    },
    shouldProcessJob: function(){
        /**
         * @returns Boolean if true continue to process the job,
         * if false and cluster is a master fork a cluster and for worker
         * cluster kill the worker
        **/
        if(cluster.isMaster){
            if(this.activeWorkers.length == this.maxWorkers || this.cpuMonitor.isCpuLimitReached()) return true;
            return false;
        }else{
            if(this.cpuMonitor.isCpuLimitReached()) return false;
            return true;
        }
    },
    addDBHooks: async function(str){
        let spliceStr = str.split('/');
        let ns = `${spliceStr.pop()}.${this.collection}`;
        let opStr = `${spliceStr.join('/')}/local`;
        const oplog = MongoOplog(opStr, { ns });
        await oplog.tail();
        oplog.on('insert', e => {
            this.processJobs();
        })
    },
    processJobs: async function(){
        var next = () => {
            this.jobInProgress = false;
            this.processJobs();
        }
        var jobToProcess = await this.jobCollection.find({status: 'queued'}, {sort: [['priority', -1]], limit: 1}).toArray();
        jobToProcess = jobToProcess[0];
        if(jobToProcess && !this.jobInProgress){
            this.jobInProgress = true;
            var {name, data} = jobToProcess;
            if(!this.jobHandlers[name]){
                return next();
            }
            if(this.shouldProcessJob()){
                var shouldProcess = await this.jobCollection.updateOne({_id: ObjectId(jobToProcess._id), status: 'queued'}, {
                    $set: {status: 'inprogress', startedAt: new Date().getTime()}
                })
                if(shouldProcess.modifiedCount > 0){
                    try{
                        this.jobHandlers[name](data, async () => {
                            await this.jobCollection.deleteOne({_id: ObjectId(jobToProcess._id)});
                            next();
                        });
                    }catch(err){
                        await this.jobCollection.updateOne({_id: ObjectId(jobToProcess._id)}, {$set: { status: 'errored' }});
                        next();
                    }
                }else{
                    next();
                }
            }else{
                if(cluster.isMaster){
                    let worker = cluster.fork();
                    this.activeWorkers.push(worker.id);
                    worker.on('exit', (code, signal) => {
                        console.log(`Worker with id: ${worker.id} exiting`);
                        let i = this.activeWorkers.indexOf(worker.id);
                        this.activeWorkers.splice(i, 1);
                    })
                    next();
                }else{
                    process.exit(0);
                }
            }
        }
    }
}

module.exports = DotQ
