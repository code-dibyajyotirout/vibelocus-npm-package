let localGenerator: any = null;
let currentModelId = "";

self.addEventListener("message", async (event: MessageEvent) => {
  const { type, data } = event.data;

  if (type === "load") {
    const { modelId } = data;
    const targetModel = modelId || "Xenova/Qwen1.5-0.5B-Chat";
    
    if (localGenerator && currentModelId === targetModel) {
      self.postMessage({ type: "load-status", data: { status: "ready" } });
      return;
    }

    self.postMessage({ type: "load-status", data: { status: "loading", progress: 0 } });

    try {
      const { pipeline, env } = await import(
        /* webpackIgnore: true */
        // @ts-ignore
        "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2"
      );
      env.allowLocalModels = false;

      const isQwen = targetModel.includes("Qwen");
      const isLaMini = targetModel.includes("LaMini") || targetModel.includes("T5");
      
      const pipelineOptions: any = {
        progress_callback: (progressData: any) => {
          if (progressData.status === "progress") {
            self.postMessage({
              type: "load-status",
              data: { status: "loading", progress: Math.round(progressData.progress) }
            });
          }
        }
      };

      if (isLaMini) {
        pipelineOptions.quantized = false;
      } else if (isQwen) {
        pipelineOptions.quantized = false;
        pipelineOptions.model_file_name = "decoder_model_merged";
      }

      try {
        localGenerator = await pipeline("text-generation", targetModel, pipelineOptions);
      } catch (firstErr) {
        // Fallback to standard automatic options if custom model parameters fail
        localGenerator = await pipeline("text-generation", targetModel, {
          progress_callback: pipelineOptions.progress_callback
        });
      }

      currentModelId = targetModel;
      self.postMessage({ type: "load-status", data: { status: "ready" } });
    } catch (err: any) {
      self.postMessage({ type: "load-status", data: { status: "error", error: err.message } });
    }
  }

  if (type === "query") {
    const { messages, systemInstruction, modelId } = data;
    const targetModel = modelId || "Xenova/Qwen1.5-0.5B-Chat";

    try {
      if (!localGenerator) {
        throw new Error("Local LLM model is not loaded. Please activate it first.");
      }

      // Format prompt according to the selected model type
      let prompt = "";
      const isLaMini = targetModel.includes("LaMini");
      
      if (isLaMini) {
        prompt += `Below is a dialogue between a student and an expert AI tutor.\n`;
        if (systemInstruction) {
          prompt += `${systemInstruction}\n\n`;
        }
        messages.forEach((msg: any) => {
          prompt += `${msg.role === "assistant" ? "AI Tutor" : "Student"}: ${msg.content}\n`;
        });
        prompt += `AI Tutor: `;
      } else {
        // Qwen ChatML formatting
        if (systemInstruction) {
          prompt += `<|im_start|>system\n${systemInstruction}<|im_end|>\n`;
        }
        messages.forEach((msg: any) => {
          prompt += `<|im_start|>${msg.role === "assistant" ? "assistant" : "user"}\n${msg.content}<|im_end|>\n`;
        });
        prompt += `<|im_start|>assistant\n`;
      }

      const isSyllabus = prompt.includes("syllabus") || prompt.includes("JSON");
      const output = await localGenerator(prompt, {
        max_new_tokens: isSyllabus ? 384 : 512,
        temperature: isSyllabus ? 0.2 : 0.7,
        do_sample: isSyllabus ? false : true,
        top_p: 0.9,
        return_full_text: false,
      });

      let generatedText = output[0]?.generated_text || "";
      generatedText = generatedText.replace(/<\|im_end\|>/g, "").trim();

      if (isLaMini) {
        const studentIndex = generatedText.indexOf("Student:");
        if (studentIndex !== -1) {
          generatedText = generatedText.substring(0, studentIndex).trim();
        }
        const userIndex = generatedText.indexOf("User:");
        if (userIndex !== -1) {
          generatedText = generatedText.substring(0, userIndex).trim();
        }
      }

      self.postMessage({ type: "query-result", data: { text: generatedText } });
    } catch (err: any) {
      self.postMessage({ type: "query-error", data: { error: err.message } });
    }
  }
});
