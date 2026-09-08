import '../src/env-bootstrap';
import handler, { createServer } from '../src/main';

export { createServer, createServer as createServerlessServer };
export default handler;

