var {CPUMonitor} = require('./cpuMonit.js');
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
    jobInProgress: false,
    resetOptions: function(){
        this.maxWorkers = numCPUs;
        this.jobHandlers = {};
        this.collection = 'dot_queue';
    },
    setOptions: function(o){
        this.maxWorkers = o.maxWorkers || this.maxWorkers;
        this.collection = o.collection || this.collection
        if(this.maxWorkers < 0 || this.maxWorkers > numCPUs){
            this.resetOptions();
            throw new Error(`Max workers should be between 1 and ${numCPUs}`);
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
    addJob: function(jobName, data){
        if(this.definedJob) throw new Error('Cannot add and define job in same process.');

        return new Promise(async (resolve, reject) => {
            if(!this.queueCreated) return reject({error_message: 'Create a queue before adding any job!'});
            try{
                await this.jobCollection.insert({
                    name: jobName,
                    data,
                    queueAt: new Date().getTime(),
                    status: 'queued'
                })
                resolve();
            }catch(err){
                reject({...err, error_message: 'MonogoDB error!'})
            }
        })
    },
    addDBHooks: async function(str){
        let spliceStr = str.split('/');
        let ns = `${spliceStr.pop()}.${this.collection}`;
        let opStr = `${spliceStr.join('/')}/local`;
        console.log(opStr, ns);
        const oplog = MongoOplog(opStr, { ns });
        await oplog.tail();
        oplog.on('insert', e => {
            this.processJobs();
        })
    },
    processJobs: async function(){
        function next(){
            this.jobInProgress = false;
            this.processJobs();
        }

        var jobToProcess = await this.jobCollection.findOne({status: 'queued'});
        if(jobToProcess && !this.jobInProgress){
            this.jobInProgress = true;
            var {name, data} = jobToProcess;
            if(!this.jobHandlers[name]){
                return next();
            }
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
                    await this.jobCollection.updateOne({_id: ObjectId(jobToProcess._id), status: 'errored'});
                    next();
                }
            }else{
                next();
            }
        }
    }
}

module.exports = DotQ
