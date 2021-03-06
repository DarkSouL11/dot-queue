var DotQ = require('../utils/queue.js');
var config = require('./config.json');
var child_process = require('child_process');

async function initMyQ(){
    try{
        await DotQ.create({collection: "my_queue", maxWorkers: 50}, config.MONGO_URL);
        DotQ.defineJob('download_image', (job_data, done) => {
            console.log("Processing ", job_data.id);
            child_process.execSync(`curl ${job_data.url} -o dump/${job_data.id}.jpg`);
            done();
        })
    }catch(err){
        console.log(err);
    }
}

initMyQ();
