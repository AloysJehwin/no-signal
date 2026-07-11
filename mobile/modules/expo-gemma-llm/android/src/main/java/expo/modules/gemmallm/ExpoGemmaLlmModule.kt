package expo.modules.gemmallm

import android.graphics.BitmapFactory
import android.net.Uri
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.genai.llminference.GraphOptions
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileNotFoundException

class ExpoGemmaLlmModule : Module() {
  private var llm: LlmInference? = null
  private val scope = CoroutineScope(Dispatchers.Default)

  override fun definition() = ModuleDefinition {
    Name("ExpoGemmaLlm")

    Function("isReady") {
      llm != null
    }

    AsyncFunction("initializeModel") { modelPath: String, promise: expo.modules.kotlin.Promise ->
      scope.launch {
        try {
          val file = File(Uri.parse(modelPath).path ?: modelPath)
          if (!file.exists()) throw FileNotFoundException("model not found at $modelPath")

          val options = LlmInference.LlmInferenceOptions.builder()
            .setModelPath(file.absolutePath)
            .setMaxTokens(1024)
            .setMaxTopK(64)
            .build()

          llm = LlmInference.createFromOptions(appContext.reactContext, options)
          promise.resolve(true)
        } catch (t: Throwable) {
          promise.reject(CodedException("GEMMA_INIT_FAILED", t.message ?: "init failed", t))
        }
      }
    }

    AsyncFunction("runInference") { prompt: String, imageUri: String?, promise: expo.modules.kotlin.Promise ->
      scope.launch {
        try {
          val engine = llm ?: throw IllegalStateException("model not initialised")
          val result = withContext(Dispatchers.Default) {
            if (imageUri.isNullOrBlank()) {
              engine.generateResponse(prompt)
            } else {
              val sessionOptions = LlmInferenceSession.LlmInferenceSessionOptions.builder()
                .setTopK(40)
                .setTemperature(0.4f)
                .setGraphOptions(GraphOptions.builder().setEnableVisionModality(true).build())
                .build()
              LlmInferenceSession.createFromOptions(engine, sessionOptions).use { session ->
                session.addQueryChunk(prompt)
                val bitmap = decodeBitmap(imageUri)
                val mpImage = BitmapImageBuilder(bitmap).build()
                session.addImage(mpImage)
                session.generateResponse()
              }
            }
          }
          promise.resolve(result)
        } catch (t: Throwable) {
          promise.reject(CodedException("GEMMA_INFERENCE_FAILED", t.message ?: "inference failed", t))
        }
      }
    }

    AsyncFunction("unload") { promise: expo.modules.kotlin.Promise ->
      try {
        llm?.close()
        llm = null
        promise.resolve(true)
      } catch (t: Throwable) {
        promise.reject(CodedException("GEMMA_UNLOAD_FAILED", t.message ?: "unload failed", t))
      }
    }
  }

  private fun decodeBitmap(uri: String): android.graphics.Bitmap {
    val path = Uri.parse(uri).path ?: uri
    return BitmapFactory.decodeFile(path)
      ?: throw IllegalArgumentException("could not decode image at $uri")
  }
}
