import cron from "node-cron";


class CronService {
  
  monthlySchedule: string;
  batchSize: number;
  fiveMinutesSchedule: string;

  constructor() {
    this.batchSize = 100; // Default batch size
    this.monthlySchedule = "0 0 1 * *"; // Runs at 12:00 AM on the 1st day of every month
    this.fiveMinutesSchedule = "0 */5 * * * *";
  }

  public start() {
    console.log("Background jobs service started...");
    // this.runJob();
    return;
  }

//   runJob() {
//     cron.schedule(this.monthlySchedule, async () => {
//       await this.job();
//     });
//   }

  async job() {
    try {
      console.log("Starting job change");



      console.log("job completed.");
      return true;
    } catch (error) {
      return console.log(
        `job Update failed with error:${error}`,
      );
    }
  }
}

export default new CronService();
