package com.autoris.asrbenchmark.benchmark

import kotlin.math.sin

enum class BenchmarkTrack(
    val id: String,
    val displayName: String,
    val description: String
) {
    VIETNAMESE_RADIOLOGY(
        id = "VIETNAMESE_RADIOLOGY",
        displayName = "Tiếng Việt (CĐHA)",
        description = "Đánh giá ASR lâm sàng tiếng Việt chuyên sâu cho Chẩn đoán Hình ảnh."
    ),
    ENGLISH_FRONTEND(
        id = "ENGLISH_FRONTEND",
        displayName = "English Frontend Audio",
        description = "Benchmark frontend audio pipeline, noise immunity, and entity extraction on English reports."
    );

    companion object {
        fun fromId(id: String): BenchmarkTrack {
            return entries.firstOrNull { it.id.equals(id, ignoreCase = true) } ?: VIETNAMESE_RADIOLOGY
        }
    }
}

object EnglishTestSet {

    val SENTENCES: List<MedicalTestSentence> = listOf(
        MedicalTestSentence(
            id = "ENG_001",
            category = "CT Head",
            referenceText = "No acute intracranial hemorrhage or mass effect.",
            keyTerms = listOf("intracranial hemorrhage", "mass effect"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("intracranial"),
            keyNegations = listOf("no acute")
        ),
        MedicalTestSentence(
            id = "ENG_002",
            category = "CT Abdomen",
            referenceText = "Right renal cortex demonstrates an exophytic 15 × 12 mm simple cyst.",
            keyTerms = listOf("renal cortex", "simple cyst", "exophytic"),
            keyNumbers = listOf("15 × 12 mm"),
            keyAnatomy = listOf("right renal"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "ENG_003",
            category = "MRI Spine",
            referenceText = "L4-L5 broad-based posterior disc protrusion with mild bilateral neural foraminal narrowing.",
            keyTerms = listOf("disc protrusion", "foraminal narrowing"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("L4-L5", "bilateral"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "ENG_004",
            category = "CT Chest",
            referenceText = "Left lower lobe nodular density measuring 8 mm, recommend follow-up CT in 6 months.",
            keyTerms = listOf("nodular density", "follow-up CT"),
            keyNumbers = listOf("8 mm", "6 months"),
            keyAnatomy = listOf("left lower lobe"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "ENG_005",
            category = "CT Abdomen",
            referenceText = "Liver size is normal with smooth contour. No intrahepatic biliary duct dilatation.",
            keyTerms = listOf("smooth contour", "biliary duct dilatation"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("liver", "intrahepatic"),
            keyNegations = listOf("no")
        ),
        MedicalTestSentence(
            id = "ENG_006",
            category = "Ultrasound",
            referenceText = "Gallbladder is distended without wall thickening or gallstones.",
            keyTerms = listOf("distended", "wall thickening", "gallstones"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("gallbladder"),
            keyNegations = listOf("without")
        ),
        MedicalTestSentence(
            id = "ENG_007",
            category = "CT Angio",
            referenceText = "Abdominal aorta diameter is normal measuring 18 mm without aneurysm or dissection.",
            keyTerms = listOf("aneurysm", "dissection"),
            keyNumbers = listOf("18 mm"),
            keyAnatomy = listOf("abdominal aorta"),
            keyNegations = listOf("without")
        ),
        MedicalTestSentence(
            id = "ENG_008",
            category = "CT Chest",
            referenceText = "Small left pleural effusion with adjacent compressive atelectasis.",
            keyTerms = listOf("pleural effusion", "compressive atelectasis"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("left pleural"),
            keyNegations = emptyList()
        )
    )
}

/**
 * Generates synthetic speech/noise audio for frontend benchmarking when external WAVs are absent.
 */
object SyntheticAudioGenerator {

    /**
     * Generates a 16kHz synthetic vowel-like multi-harmonic audio buffer.
     */
    fun generateSyntheticSpeechAudio(durationSec: Float, sampleRate: Int = 16000): FloatArray {
        val totalSamples = (durationSec * sampleRate).toInt()
        val buffer = FloatArray(totalSamples)

        val f0 = 130.0 // Fundamental frequency (Hz)
        val f1 = 500.0 // First formant
        val f2 = 1500.0 // Second formant

        for (i in 0 until totalSamples) {
            val t = i.toDouble() / sampleRate
            val s0 = sin(2.0 * Math.PI * f0 * t) * 0.4
            val s1 = sin(2.0 * Math.PI * f1 * t) * 0.25
            val s2 = sin(2.0 * Math.PI * f2 * t) * 0.15
            buffer[i] = (s0 + s1 + s2).toFloat().coerceIn(-1.0f, 1.0f)
        }
        return buffer
    }

    /**
     * Adds white/ambient noise to audio buffer at a given SNR level in dB.
     */
    fun addNoise(signal: FloatArray, snrDb: Float): FloatArray {
        val noisy = FloatArray(signal.size)
        val noiseAmp = (Math.pow(10.0, (-snrDb / 20.0)) * 0.2).toFloat()

        for (i in signal.indices) {
            val r = (Math.random() * 2.0 - 1.0).toFloat()
            val noise = r * noiseAmp
            val sum = signal[i] + noise
            noisy[i] = sum.coerceIn(-1.0f, 1.0f)
        }
        return noisy
    }
}
