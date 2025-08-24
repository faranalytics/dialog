// import { log, Message, OpenAIAgent } from "@farar/dialog";

// export class Agent extends OpenAIAgent {

//   public processMessage = async (message: Message): Promise<void> => {
//     try {

//       await this.mutex;
//       if (!this.activeMessages.has(message.uuid)) {
//         return;
//       }

//       // await this.postAgentStreamToTTS(message.uuid, stream);
//     }
//     catch (err) {
//       log.error(err, "OpenAIAgent.postUserTranscriptMessage");
//     }
//   };
// }