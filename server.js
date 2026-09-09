const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    console.log('مستخدم متصل بالمنصة الملكية:', socket.id);
    
    socket.on('join-room', (room) => {
        socket.join(room);
        io.to(room).emit('message', { user: 'النظام', text: `انضم مستخدم جديد إلى غرفة ${room}` });
    });

    socket.on('chat-message', (data) => {
        io.to(data.room).emit('message', { user: data.user, text: data.text });
    });

    socket.on('disconnect', () => {
        console.log('انقطع الاتصال:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`المنصة الملكية تعمل بنجاح على المنفذ ${PORT}`);
});
