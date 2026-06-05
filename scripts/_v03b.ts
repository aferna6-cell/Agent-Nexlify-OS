import { customerQuestion } from "../src/agents/customer_question/agent.js";
import { extractParams } from "../src/agents/_extract.js";
import { fullContext, fakeEmitter } from "../src/agents/_testkit.js";
const ask = "A customer named Aisha just asked: do you handle hybrids? Draft a reply.";
const { emitter } = fakeEmitter();
const out = await (async()=> {
  return customerQuestion.run({ input: extractParams(ask), context: fullContext(), emitTrace: emitter, ownerAsk: ask, runId: "" });
})();
