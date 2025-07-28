import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from "@/config";
import axios from "axios";
import Transport from "winston-transport";

interface BufferedTelegramTransportOptions {
  token: string;
  chatId: string;
  level?: string;
  flushInterval?: number; // in milliseconds
  bufferLimit?: number; // max messages in buffer before flush
}

class BufferedTelegramTransport extends Transport {
  private token: string;
  private chatId: string;
  private buffer: string[] = [];
  private intervalId: NodeJS.Timeout;
  private flushInterval: number;
  private bufferLimit: number;

  constructor(opts: BufferedTelegramTransportOptions) {
    super(opts);
    this.token = opts.token;
    this.chatId = opts.chatId;
    this.flushInterval = opts.flushInterval || 10000; // default: 10s
    this.bufferLimit = opts.bufferLimit || 5;

    this.intervalId = setInterval(() => this.flush(), this.flushInterval);
    console.log("Initialized TG transport");
  }

  log(info: any, callback: () => void) {
    setImmediate(() => this.emit("logged", info));

    const formatted = `*${info.level.toUpperCase()}*:\n\`\`\`${
      info.message
    }\`\`\``;

    this.buffer.push(formatted);

    if (this.buffer.length >= this.bufferLimit) {
      this.flush();
    }

    callback();
  }

  private async flush() {
    if (this.buffer.length === 0) return;

    const message = this.buffer.join("\n\n");
    this.buffer = [];

    try {
      await axios.post(
        `https://api.telegram.org/bot${this.token}/sendMessage`,
        {
          chat_id: this.chatId,
          text: message,
          parse_mode: "Markdown",
        }
      );
    } catch (error) {
      console.error("Failed to send Telegram log:", error);
    }
  }

  close() {
    clearInterval(this.intervalId);
    this.flush(); // Send remaining logs
  }
}

export const TGTransport = new BufferedTelegramTransport({
  token: TELEGRAM_BOT_TOKEN!,
  chatId: TELEGRAM_CHAT_ID!,
  level: "error",
  flushInterval: 10000, // 10s
  bufferLimit: 5,
});
