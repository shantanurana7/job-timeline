import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly ai: GoogleGenAI;
  private readonly model = 'gemini-2.5-pro';

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.ai = new GoogleGenAI({
      apiKey: this.configService.get<string>('GEMINI_API_KEY') || 'dummy-key-for-dev',
    });
  }

  async processQuery(userId: string, query: string, history: Array<{ role: string, content: string }>) {
    try {
      // Build context from user's current data (e.g. assigned jobs)
      const jobs = await this.prisma.job.findMany({
        where: {
          assignments: { some: { designerId: userId, isActive: true } },
          status: { in: ['ASSIGNED', 'IN_PROGRESS', 'AT_RISK'] },
        },
        select: { jobNumber: true, title: true, deadline: true, status: true },
      });

      const contextStr = jobs.map(j => `- ${j.jobNumber}: ${j.title} (${j.status}, due: ${j.deadline})`).join('\n');

      const systemInstruction = `You are a helpful assistant for a Job Timeline Management Platform.
You assist designers and workflow admins.
The user currently has these active jobs:
${contextStr}

Help the user manage their tasks, explain priorities, and provide short, actionable answers.`;

      // Convert history to Gemini format
      const formattedHistory = history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      const chat = this.ai.chats.create({
        model: this.model,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      // Send the history (if the SDK doesn't natively support setting history on init, we'd loop through or send the latest with history attached. The new SDK supports history in create())
      const aiChat = this.ai.chats.create({
        model: this.model,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });
      // The @google/genai SDK doesn't take history in create() the same way as old ones, let's use generateContent for simplicity since we want full control over the turns.
      
      const contents = [
        ...formattedHistory,
        { role: 'user', parts: [{ text: query }] }
      ];

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      return { reply: response.text };
    } catch (error) {
      this.logger.error(`AI Query failed: ${error.message}`);
      return { reply: "I'm having trouble connecting to my AI brain right now. Please try again later." };
    }
  }
}
