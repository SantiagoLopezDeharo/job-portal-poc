import app from "./app";
import { handleMatchQueue } from "./queue/match-queue";

export default {
	fetch: app.fetch.bind(app),
	queue: handleMatchQueue,
};

export { app };
