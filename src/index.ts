import { uuidv7 } from "uuidv7";

export enum JobResult {
	SKIP = -1,
	OK = 0,
	FAIL = 1,
	FAIL_QUEUE = 2,
}

export class Queue {
	static readonly queues: Queue[] = [];

	readonly runs: JobRun[] = [];
	beforeRun?: (run: JobRun) => void;
	afterFinish?: (run: JobRun, result: JobResult) => void;

	constructor(...jobs: Job[]) {
		for (const job of jobs) {
			this.push(job);
		}

		Queue.queues.push(this);
	}

	private tryRunFirst() {
		const first = this.runs[0];

		if (this.runs.length > 0 && first instanceof JobRun && !first.isRunning) {
			this.beforeRun?.(first);
			first.run().then((result) => {
				if (result == JobResult.FAIL_QUEUE) {
					this.clear();
					return;
				}

				this.runs.shift();
				this.afterFinish?.(first, result);

				this.tryRunFirst();
			});
		}
	}

	push(...jobs: Job[]) {
		this.runs.push(...jobs.map((job) => job.new()));
		this.tryRunFirst();
	}

	insertNext(...jobs: Job[]) {
		if (this.runs.length <= 1) {
			this.push(...jobs);
			return;
		}

		this.runs.splice(1, 0, ...jobs.map((job) => job.new()));
		this.tryRunFirst();
	}

	clear() {
		this.runs.splice(0, this.runs.length);
	}

	static clearAll() {
		for (const queue of Queue.queues) {
			queue.clear();
		}
	}
}

export class Job {
	readonly id: string;
	readonly name: string;
	readonly callback: () => JobResult | Promise<JobResult | void> | void;
	readonly beforeRun?: () => void;
	readonly afterFinish?: (result: JobResult) => void;

	constructor(name: string, callback: () => JobResult | Promise<JobResult | void> | void, beforeRun?: () => void, afterFinish?: (result: JobResult) => void) {
		this.id = uuidv7();
		this.name = name;
		this.callback = callback;
		this.beforeRun = beforeRun;
		this.afterFinish = afterFinish;
	}

	new() {
		return new JobRun(this);
	}

	async run() {
		return await this.new().run();
	}
}

export class JobRun {
	readonly id: string;
	readonly job: Job;

	private running: boolean = false;
	private startTime?: number;

	constructor(job: Job) {
		this.id = uuidv7();
		this.job = job;
	}

	async run() {
		if (this.running == true) {
			throw new Error("already running!");
		}

		this.job.beforeRun?.();

		this.running = true;
		this.startTime = performance.now();

		const result = (await this.job.callback()) ?? JobResult.OK;

		this.job.afterFinish?.(result);

		return result;
	}

	get isRunning() {
		return this.running;
	}

	get duration() {
		if (!this.running || !this.startTime) {
			return null;
		}

		return parseFloat((performance.now() - this.startTime).toFixed(2));
	}
}
