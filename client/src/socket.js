import { io } from 'socket.io-client';
import { getToken } from './api.js';

let socket;

/** One shared authenticated connection; pages subscribe with useRealtime. */
export const getSocket = () => {
  if (!socket) socket = io({ auth: (cb) => cb({ token: getToken() }), transports: ['websocket', 'polling'] });
  return socket;
};

export const closeSocket = () => {
  socket?.close();
  socket = undefined;
};
