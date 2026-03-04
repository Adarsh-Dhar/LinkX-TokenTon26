import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const proc = typeof req.query.process === 'string' ? req.query.process : Array.isArray(req.query.process) ? req.query.process[0] : '';
  let pidFile = '';
  if (proc === 'agent') {
    pidFile = path.resolve(process.cwd(), '../agent/.agent.pid');
  } else if (proc === 'server') {
    pidFile = path.resolve(process.cwd(), '../server/.server.pid');
  } else {
    res.status(400).json({ online: false, error: 'Unknown process' });
    return;
  }
  let online = false
  try {
    const pid = fs.readFileSync(pidFile, 'utf-8').trim()
    if (pid && !isNaN(Number(pid))) {
      // Optionally, check if process exists (platform dependent)
      online = true
    }
  } catch {
    online = false
  }
  res.json({ online })
}
