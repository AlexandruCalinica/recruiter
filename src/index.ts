import { shutdown } from './system'

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
