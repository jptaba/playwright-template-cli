import net from 'node:net';
import type { AddressInfo } from 'node:net';

/**
 * An SMTP server that accepts mail and keeps it, so the notification path can
 * be exercised without an account anywhere.
 *
 * **Why a socket rather than a stub transport.** `notify:email` builds a real
 * nodemailer transport from `SMTP_HOST` and `SMTP_PORT`, and the interesting
 * failures live in that layer — a wrong port, TLS expected where it is not
 * offered, an address the relay refuses. A stub that replaced nodemailer would
 * prove the digest renders and nothing about whether it can be sent.
 *
 * Speaks just enough of RFC 5321 for a client to complete a transaction:
 * greeting, `EHLO`, `MAIL FROM`, `RCPT TO`, `DATA` terminated by a lone dot,
 * `QUIT`. No TLS and no authentication — a relay that trusts its network,
 * which is exactly what an internal one usually is.
 */
export interface CapturedMail {
  from: string;
  to: string[];
  /** The raw message, headers and body together. */
  data: string;
  subject: string;
}

export class FakeSmtpServer {
  private server?: net.Server;

  readonly received: CapturedMail[] = [];

  async start(): Promise<{ host: string; port: number }> {
    this.server = net.createServer((socket) => this.handle(socket));
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    const address = this.server.address() as AddressInfo;
    return { host: '127.0.0.1', port: address.port };
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  private handle(socket: net.Socket): void {
    let buffer = '';
    let inData = false;
    let mail: CapturedMail = { from: '', to: [], data: '', subject: '' };

    const say = (line: string): void => void socket.write(`${line}\r\n`);
    say('220 fake-smtp ready');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');

      for (;;) {
        if (inData) {
          /*
             DATA ends at a line containing only a dot. Checked on the buffer
             rather than per line because a message body arrives in whatever
             chunks the socket felt like.
          */
          const end = buffer.indexOf('\r\n.\r\n');
          if (end === -1) return;
          mail.data = buffer.slice(0, end);
          mail.subject = /^Subject:\s*(.+)$/im.exec(mail.data)?.[1]?.trim() ?? '';
          this.received.push(mail);
          mail = { from: '', to: [], data: '', subject: '' };
          buffer = buffer.slice(end + 5);
          inData = false;
          say('250 OK: queued');
          continue;
        }

        const breakAt = buffer.indexOf('\r\n');
        if (breakAt === -1) return;
        const line = buffer.slice(0, breakAt);
        buffer = buffer.slice(breakAt + 2);
        const verb = line.slice(0, 4).toUpperCase();

        if (verb === 'EHLO' || verb === 'HELO') {
          // No extensions advertised: no AUTH, no STARTTLS. A client that
          // insists on either fails loudly here rather than silently sending
          // in the clear somewhere else.
          say('250 fake-smtp');
        } else if (verb === 'MAIL') {
          mail.from = /<([^>]*)>/.exec(line)?.[1] ?? '';
          say('250 OK');
        } else if (verb === 'RCPT') {
          const address = /<([^>]*)>/.exec(line)?.[1];
          if (address) mail.to.push(address);
          say('250 OK');
        } else if (verb === 'DATA') {
          inData = true;
          say('354 End data with <CR><LF>.<CR><LF>');
        } else if (verb === 'QUIT') {
          say('221 Bye');
          socket.end();
          return;
        } else if (verb === 'RSET') {
          mail = { from: '', to: [], data: '', subject: '' };
          say('250 OK');
        } else {
          say('250 OK');
        }
      }
    });

    socket.on('error', () => undefined);
  }
}
