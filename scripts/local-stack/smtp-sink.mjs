// Minimal SMTP server for the local stack: accepts every message from GoTrue and writes it to
// $MAIL_DIR/<timestamp>-<recipient>.eml so tests can follow password-reset and confirmation links.
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const PORT = +process.env.SMTP_PORT || 2500;
const DIR = process.env.MAIL_DIR;
fs.mkdirSync(DIR, { recursive: true });

net.createServer((sock) => {
  let buf = '', rcpt = [], data = false, body = [];
  const say = (s) => sock.write(s + '\r\n');
  say('220 macro-local ESMTP');
  sock.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (data) {
        if (line === '.') {
          data = false;
          const to = (rcpt[0] || 'unknown').replace(/[^a-z0-9@._-]/gi, '');
          fs.writeFileSync(path.join(DIR, `${Date.now()}-${to}.eml`), body.join('\n'));
          body = []; rcpt = [];
          say('250 OK');
        } else body.push(line.startsWith('..') ? line.slice(1) : line);
        continue;
      }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO') { sock.write('250-macro-local\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n'); }
      else if (cmd === 'HELO') say('250 macro-local');
      else if (cmd === 'AUTH') say('235 OK');
      else if (cmd === 'MAIL' || cmd === 'RSET' || cmd === 'NOOP') say('250 OK');
      else if (cmd === 'RCPT') { rcpt.push((line.match(/<([^>]+)>/) || [])[1]); say('250 OK'); }
      else if (cmd === 'DATA') { data = true; say('354 End data with <CR><LF>.<CR><LF>'); }
      else if (cmd === 'QUIT') { say('221 Bye'); sock.end(); }
      else say('250 OK');
    }
  });
  sock.on('error', () => {});
}).listen(PORT, '127.0.0.1', () => console.log(`smtp sink on :${PORT}`));
