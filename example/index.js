var DotQ = require('../utils/queue');
var config = require('./config.json');

async function initMyQ(){
    try{
        await DotQ.create({collection: "my_queue"}, config.MONGO_URL);
        for(var k=0;k<100;k++){
            await DotQ.addJob('download_image', {id: k, url: 'https://unsplash.com/photos/-HGy4pFoIQw/download?force=true'})
        }
    }catch(err){
        console.log(err);
    }
}

initMyQ();
