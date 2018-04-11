### Dot queue

Dot queue is a node js queue with support for multiprocessing. Dot queue forks workers smartly based on the current cpu usage.

### How to install
```
npm i dot-queue
```

### Documentation

Make sure your mongo instance is a replica set. Refer [here](https://github.com/cayasso/mongo-oplog#configure-mongodb-with-replica-set "here") for creating a replica set. **This module will not work if replica set is not initiated**.  

Import the queue.

`const DotQ = require('dot-queue');`

Initiate a queue.

`DotQ.create([options], mongoConnectionStr)`

#### Options
 **maxWorkers**: maximum number of workers master can fork.  
	 *data-type*: int  
	 *default*: Equal to number of cpu cores i.e `os.cpus().length`  

**collection**: mongo db collection name for maintianing job queues data.  
	*data-type*: string  
	*default*: 'dot_queue'

**maxCPUUsage**: Percentage cpu usage after which workers should be killed or not allowed to be forked.  
	*data-type*: int  
	*default*: 75

#### Methods
**defineJob**: Define a new job handler.  
**Arguments**:  
	*name*: (string) Name with which jobs in queue can identify the defined jobs.   
	*action*: (function) Job handler function.

ex:
```
DotQ.defineJob('download_image', (job_data, done) => {
	child_process.execSync(`curl ${job_data.url} -o dump/${job_data.id}.jpg`);
	 // Calling done will signal the queue that the job has been succesfully
	 // processed and it can be removed from the queue
	done();
})
```
**addJob**: Add a new job to the queue (asyncronous).  
**Arguments**:  
	*name*: (string) Job name used to identify the job to be performed.  
	*data*: (object) Data to be passed to the job while processing.   
    *priority*: (int) Priority of the job. Optional, if nothing specified it will be 5. Higher priority jobs will be processed first.   
ex:
```
DotQ.addJob('download_image', {
	id: 25,
	url: <some-image-url>
})
```

**Important note**: Adding jobs and defining jobs should always be done in different scripts. If done in same scripts then dot-queue will throw an error.

### License

MIT License
