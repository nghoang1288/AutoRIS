package com.autoris.asrbenchmark.audio

import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Utility to write 16-bit mono 16000Hz PCM audio to standard WAV format.
 */
object WavWriter {

    fun writeWavFile(file: File, pcmData: ShortArray, sampleRate: Int = 16000) {
        val totalAudioLen = (pcmData.size * 2).toLong()
        val totalDataLen = totalAudioLen + 36
        val channels = 1
        val byteRate = sampleRate * channels * 2

        FileOutputStream(file).use { out ->
            val header = ByteArray(44)
            val bb = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN)

            // RIFF chunk
            header[0] = 'R'.code.toByte()
            header[1] = 'I'.code.toByte()
            header[2] = 'F'.code.toByte()
            header[3] = 'F'.code.toByte()
            bb.position(4)
            bb.putInt(totalDataLen.toInt())
            header[8] = 'W'.code.toByte()
            header[9] = 'A'.code.toByte()
            header[10] = 'V'.code.toByte()
            header[11] = 'E'.code.toByte()

            // fmt chunk
            header[12] = 'f'.code.toByte()
            header[13] = 'm'.code.toByte()
            header[14] = 't'.code.toByte()
            header[15] = ' '.code.toByte()
            bb.position(16)
            bb.putInt(16) // Subchunk1Size (16 for PCM)
            bb.putShort(1.toShort()) // AudioFormat (1 for PCM)
            bb.putShort(channels.toShort()) // NumChannels
            bb.putInt(sampleRate) // SampleRate
            bb.putInt(byteRate) // ByteRate
            bb.putShort(2.toShort()) // BlockAlign (channels * bitsPerSample / 8)
            bb.putShort(16.toShort()) // BitsPerSample

            // data chunk
            header[36] = 'd'.code.toByte()
            header[37] = 'a'.code.toByte()
            header[38] = 't'.code.toByte()
            header[39] = 'a'.code.toByte()
            bb.position(40)
            bb.putInt(totalAudioLen.toInt())

            out.write(header)

            val pcmBytes = ByteArray(pcmData.size * 2)
            ByteBuffer.wrap(pcmBytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().put(pcmData)
            out.write(pcmBytes)
        }
    }
}
