import { randomUUID } from "crypto";
import OpenAI from "openai";

const openaiApiKey = "";
const HELICONE_API_KEY = "";

export type HeliconeAyncLogRequest = {
  providerRequest: ProviderRequest;
  providerResponse: ProviderResponse;
  timing: Timing;
};

export type ProviderRequest = {
  url: string;
  json: {
    [key: string]: any;
  };
  meta: Record<string, string>;
};

export type ProviderResponse = {
  json: {
    [key: string]: any;
  };
  status: number;
  headers: Record<string, string>;
};

export type Timing = {
  startTime: {
    seconds: number;
    milliseconds: number;
  };
  endTime: {
    seconds: number;
    milliseconds: number;
  };
};

export class HeliconeLogger {
  private apiKey: string;
  private baseUrl: string = "https://api.us.hconeai.com/custom/v1/log";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async log(request: HeliconeAyncLogRequest): Promise<void> {
    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error("Error logging to Helicone:", error);
    }
  }

  createTiming(): Timing {
    const now = Date.now();
    return {
      startTime: {
        seconds: Math.floor(now / 1000),
        milliseconds: now % 1000,
      },
      endTime: {
        seconds: 0,
        milliseconds: 0,
      },
    };
  }

  updateEndTime(timing: Timing): Timing {
    const now = Date.now();
    return {
      ...timing,
      endTime: {
        seconds: Math.floor(now / 1000),
        milliseconds: now % 1000,
      },
    };
  }
}

async function defaultRequestProdAssistant() {
  const session = randomUUID();
  const openai = new OpenAI({
    apiKey: openaiApiKey,
  });

  const heliconeLogger = new HeliconeLogger(HELICONE_API_KEY);

  const assistantTiming = heliconeLogger.createTiming();
  const { data: assistant, response: assistantResponse } =
    await openai.beta.assistants
      .create({
        name: "VisaCalculator1",
        instructions:
          "You are a visa application advisor with calculation capabilities. Provide information on visa processes and perform calculations related to visa fees, stay duration, and application processing times.",
        tools: [{ type: "code_interpreter" }],
        model: "gpt-4o-mini",
      })
      .withResponse();
  const updatedAssistantTiming = heliconeLogger.updateEndTime(assistantTiming);

  await heliconeLogger.log({
    providerRequest: {
      url: "https://api.openai.com/v1/assistants",
      meta: {
        "Helicone-Session-Id": session,
        "Helicone-Session-Path": "/visa-calculator",
        "Helicone-Session-Name": "VisaCalculation",
      },
      json: {
        model: "gpt-4o-mini",
        data: [
          {
            model: "gpt-4o-mini",
          },
        ],
      },
    },
    providerResponse: {
      status: assistantResponse.status,
      headers: {
        "Helicone-Session-Id": session,
        "Helicone-Session-Path": "/visa-calculator",
        "Helicone-Session-Name": "VisaCalculation",
      },
      json: {
        call: "CreateAssistant",
        data: [
          {
            assistant_id: assistant.id,
            model: "gpt-4o-mini",
            usage: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
            },
          },
        ],
      },
    },
    timing: updatedAssistantTiming,
  });

  const thread = await openai.beta.threads.create();
  //   const messageTiming = heliconeLogger.createTiming();

  const { data: message, response: messageResponse } =
    await openai.beta.threads.messages
      .create(thread.id, {
        role: "user",
        content:
          "If a Schengen visa costs €80 and I'm staying for 15 days, what's my daily visa cost? Round to 2 decimal places.",
      })
      .withResponse();

  const runTiming = heliconeLogger.createTiming();
  const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
    instructions:
      "Use the code interpreter to perform calculations. Provide a detailed explanation of the calculation process. Address the user as Valued Applicant.",
  });
  const updatedRunTiming = heliconeLogger.updateEndTime(runTiming);
  console.log(`run.status: ${run.status}`);
  console.log(`run: ${JSON.stringify(run)}`);

  await heliconeLogger.log({
    providerRequest: {
      url: "https://api.openai.com/v1/threads/runs",
      meta: {
        "Helicone-Session-Id": session,
        "Helicone-Session-Path": "/visa-calculator/cost-calculation/result",
        "Helicone-Session-Name": "VisaCalculation",
      },
      json: {},
    },
    providerResponse: {
      status: 200,
      headers: {},
      json: {
        model: "gpt-4o-mini",
        call: "CreateAndPollRun",
        assistant_id: assistant.id,
        status: run.status,
        usage: {
          prompt_tokens: run.usage?.prompt_tokens || 0,
          completion_tokens: run.usage?.completion_tokens || 0,
          total_tokens: run.usage?.total_tokens || 0,
        },
      },
    },
    timing: updatedRunTiming,
  });
}

defaultRequestProdAssistant();
