var DotQ = require('./utils/queue.js');
var numCPUs = require('os').cpus().length;

var config = require('./config.json');

// var monitor = CPUMonitor.start({
//     alertValue: 20
// });
//
// monitor.on('update', (d) => {
//     console.log(`Current CPU Usage: ${d.toFixed(2)}%
//                 \n-----------------------------------------\n`);
// })
//
// monitor.on('alert', (d) => {
//     console.log(`Current CPU Usage limit reached!
//                 \nCurrent Usage: ${d.cpuUsage.toFixed(2)}%
//                 \nUsage Limit: ${d.alertValue.toFixed(2)}%
//                 \n-----------------------------------------\n`);
// })
//
// setTimeout(() => {
//     CPUMonitor.stop();
// }, 30000)

async function initMyQ(){
    try{
        await DotQ.create({collection: "my_queue"}, config.MONGO_URL);
        console.log("Queue created");
        await DotQ.addJob('send_email', {username: 'Sundeep'})
    }catch(err){
        console.log(err);
    }
}

initMyQ();
