package com.autoris.asrbenchmark.noise

import com.autoris.asrbenchmark.audio.PreprocessingProfile

/**
 * Standardized Radiology Reading Room Acoustic Scenarios.
 */
enum class NoiseScenario(
    val id: String,
    val displayName: String,
    val roomType: String,
    val defaultNoiseType: String,
    val defaultNoiseLevel: String,
    val typicalFloorDb: Float,
    val recommendedProfile: PreprocessingProfile,
    val description: String
) {
    ROOM_READING_STANDARD(
        id = "ROOM_01",
        displayName = "Phòng đọc CĐHA chuẩn (Yên tĩnh)",
        roomType = "reading_room",
        defaultNoiseType = "clean",
        defaultNoiseLevel = "quiet",
        typicalFloorDb = -52.0f,
        recommendedProfile = PreprocessingProfile.RAW,
        description = "Phòng đọc chuẩn với điều hòa êm, tiếng gõ phím nhẹ, cách âm tốt."
    ),
    ROOM_MRI_CONSOLE(
        id = "ROOM_MRI",
        displayName = "Bàn điều khiển MRI (Quạt chiller/Gradient)",
        roomType = "mri_console",
        defaultNoiseType = "mri_chiller",
        defaultNoiseLevel = "moderate",
        typicalFloorDb = -42.0f,
        recommendedProfile = PreprocessingProfile.ANDROID_NS,
        description = "Bàn máy MRI có tiếng rít quạt làm mát cao tần và tiếng rung bơm helium."
    ),
    ROOM_CT_CONSOLE(
        id = "ROOM_CT",
        displayName = "Bàn điều khiển CT (Gantry quay/KTV)",
        roomType = "ct_console",
        defaultNoiseType = "ct_gantry",
        defaultNoiseLevel = "moderate",
        typicalFloorDb = -44.0f,
        recommendedProfile = PreprocessingProfile.ANDROID_NS,
        description = "Khu vực điều khiển CT nhiều màn hình, tiếng quạt tản nhiệt và gantry quay."
    ),
    ROOM_ULTRASOUND(
        id = "ROOM_US",
        displayName = "Phòng Siêu âm (Bệnh nhân/Gel probe)",
        roomType = "ultrasound_room",
        defaultNoiseType = "speech_babble",
        defaultNoiseLevel = "moderate",
        typicalFloorDb = -46.0f,
        recommendedProfile = PreprocessingProfile.ANDROID_NS,
        description = "Phòng siêu âm tối, có tiếng trao đổi hướng dẫn bệnh nhân và thao tác đầu dò."
    ),
    ROOM_INTERVENTION(
        id = "ROOM_ANGIO",
        displayName = "Phòng Can thiệp DSA (Monitor/Bíp)",
        roomType = "angio_suite",
        defaultNoiseType = "alarm_beep",
        defaultNoiseLevel = "loud",
        typicalFloorDb = -38.0f,
        recommendedProfile = PreprocessingProfile.ANDROID_NS_AGC,
        description = "Phòng can thiệp mạch tiếng máy thở, monitor theo dõi sinh tồn kêu bíp liên tục."
    ),
    ROOM_EMERGENCY(
        id = "ROOM_ER",
        displayName = "Bàn đọc Cấp cứu (Ồn ào hỗn hợp)",
        roomType = "emergency_reading",
        defaultNoiseType = "crowded_babble",
        defaultNoiseLevel = "loud",
        typicalFloorDb = -36.0f,
        recommendedProfile = PreprocessingProfile.ANDROID_NS_AGC,
        description = "Khu vực cấp cứu đông đúc, tiếng bước chân, chuông điện thoại, hội chẩn gấp."
    );

    companion object {
        fun fromId(id: String): NoiseScenario {
            return entries.firstOrNull { it.id.equals(id, ignoreCase = true) } ?: ROOM_READING_STANDARD
        }
    }
}
