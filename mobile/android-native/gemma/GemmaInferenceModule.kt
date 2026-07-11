package com.nosignal.gemma

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class GemmaInferenceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "GemmaInference"

    @ReactMethod
    fun isReady(promise: Promise) {
        // TODO: report true once LiteRT-LM engine is loaded and warm.
        promise.resolve(false)
    }

    @ReactMethod
    fun runInference(prompt: String, promise: Promise) {
        try {
            // TODO: wire LiteRT-LM here.
            // 1. Lazy-load gemma_4_e4b.task from assets/models on first call.
            // 2. Feed `prompt` through the engine, capture the decoded string.
            // 3. Return the JSON string the ReasoningLoop expects
            //    ({hypothesis, step, expected, confidence}).
            val stub = "{\"hypothesis\":\"stub\",\"step\":\"native module not wired\"," +
                "\"expected\":\"\",\"confidence\":0.0}"
            promise.resolve(stub)
        } catch (t: Throwable) {
            promise.reject("GEMMA_INFERENCE_FAILED", t)
        }
    }
}
