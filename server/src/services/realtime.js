import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { User } from '../models/User.js';

let io = null;

/**
 * Rooms: clinic:{id} (staff, authenticated), user:{id} (personal), display:{id} (public queue screen).
 * Events are no-ops until initRealtime runs, so services and tests need no socket server.
 */
export const initRealtime = (httpServer) => {
  io = new Server(httpServer, { cors: { origin: env.clientOrigin } });

  io.use(async (socket, next) => {
    try {
      const { token, displayClinic } = socket.handshake.auth ?? {};
      if (displayClinic) {
        socket.data.displayClinic = String(displayClinic); // public screen: receives token numbers only
        return next();
      }
      const payload = jwt.verify(token, env.jwtSecret);
      const user = await User.findById(payload.sub);
      if (!user?.active) return next(new Error('unauthorized'));
      socket.data.user = user;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.data.displayClinic) return socket.join(`display:${socket.data.displayClinic}`);
    const { user } = socket.data;
    socket.join(`user:${user.id}`);
    if (user.role !== 'patient') socket.join(`clinic:${user.clinic}`);
  });
  return io;
};

export const emitClinic = (clinic, event, payload) => io?.to(`clinic:${clinic}`).emit(event, payload);
export const emitUser = (user, event, payload) => io?.to(`user:${user}`).emit(event, payload);
export const emitDisplay = (clinic, event, payload) => io?.to(`display:${clinic}`).emit(event, payload);
export const closeRealtime = () => io?.close();
