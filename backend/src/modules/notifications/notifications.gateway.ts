import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@WebSocketGateway({
  cors: {
    origin: '*', // We can lock this down to FRONTEND_URL in production
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  
  // Track active user sockets: userId -> socketId[]
  private userSockets: Map<string, Set<string>> = new Map();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });

      const userId = payload.sub;
      client.data.user = payload; // store user on socket

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      // Join a personal room for targeted events
      client.join(`user_${userId}`);
      
      // If workflow admin or admin, they can join stream rooms later or globally
      if (payload.role === 'ADMIN') {
        client.join('admin_room');
      }

      this.logger.log(`Client connected: ${client.id} (User: ${userId})`);
      
      // Send initial unread count
      const count = await this.notificationsService.getUnreadCount(userId);
      this.sendToUser(userId, 'notification:unread_count', { count });

    } catch (err) {
      this.logger.error(`Connection failed: ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.user?.sub;
    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId)!.delete(client.id);
      if (this.userSockets.get(userId)!.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  sendToUser(userId: string, event: string, payload: any) {
    this.server.to(`user_${userId}`).emit(event, payload);
  }

  sendToAll(event: string, payload: any) {
    this.server.emit(event, payload);
  }

  broadcastJobUpdate(jobId: string, status: string, payload: any) {
    // Notify all connected clients about job status changes
    // In a real app, this might be filtered by role/stream
    this.server.emit('job:status_changed', { jobId, status, ...payload });
  }
}
