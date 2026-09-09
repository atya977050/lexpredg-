const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    socket.on('join-room', (room) => {
        socket.join(room);
        io.to(room).emit('message', { user: 'النظام', text: `انضم مستخدم إلى ${room}` });
    });
    socket.on('chat-message', (data) => {
        io.to(data.room).emit('message', { user: data.user, text: data.text });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT);
