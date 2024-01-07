require("dotenv").config();
const express = require("express");
const connect = require('./config/db');
const userRouter = require('./api/user');


const app = express()
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(express.json());
app.use('/user', userRouter)




// Listening to port and connecion to MONGO_URI
const start = async ()=>{
    try {
        await connect(process.env.MONGODB_URI);
        app.listen(PORT, ()=>{
            console.log(`Server is listening on PORT ${PORT}...`);
        })
    } catch (error) {
        console.log('There is Error', error);
    }
}

start()