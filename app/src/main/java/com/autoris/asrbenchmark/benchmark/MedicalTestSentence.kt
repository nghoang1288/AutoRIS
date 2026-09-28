package com.autoris.asrbenchmark.benchmark

data class MedicalTestSentence(
    val id: String,
    val category: String,
    val referenceText: String,
    val keyTerms: List<String> = emptyList(),
    val keyNumbers: List<String> = emptyList(),
    val keyAnatomy: List<String> = emptyList(),
    val keyNegations: List<String> = emptyList()
)

object MedicalTestSet {

    val SENTENCES: List<MedicalTestSentence> = listOf(
        // === 1. CT BỤNG (Abdominal CT) ===
        MedicalTestSentence(
            id = "TEST_001",
            category = "CT bụng",
            referenceText = "Dày không đều thành hang - môn vị dạ dày, chỗ dày nhất 21 mm, gây hẹp lòng môn vị.",
            keyTerms = listOf("dày không đều", "hẹp lòng"),
            keyNumbers = listOf("21 mm"),
            keyAnatomy = listOf("hang - môn vị", "dạ dày", "môn vị"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_002",
            category = "CT bụng",
            referenceText = "Hạch lớn nhất kích thước 21 × 8 mm, bờ không đều, sau tiêm ngấm thuốc không đồng nhất.",
            keyTerms = listOf("hạch", "bờ không đều", "ngấm thuốc không đồng nhất"),
            keyNumbers = listOf("21 × 8 mm"),
            keyAnatomy = listOf("hạch"),
            keyNegations = listOf("không đều", "không đồng nhất")
        ),
        MedicalTestSentence(
            id = "TEST_003",
            category = "CT bụng",
            referenceText = "Gan không to, bờ đều, nhu mô gan trái có nang đường kính 9 mm.",
            keyTerms = listOf("bờ đều", "nhu mô gan", "nang"),
            keyNumbers = listOf("9 mm"),
            keyAnatomy = listOf("gan", "gan trái"),
            keyNegations = listOf("không to")
        ),
        MedicalTestSentence(
            id = "TEST_004",
            category = "CT bụng",
            referenceText = "Tĩnh mạch cửa không giãn, không thấy huyết khối trong lòng mạch.",
            keyTerms = listOf("tĩnh mạch cửa", "huyết khối"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("tĩnh mạch cửa"),
            keyNegations = listOf("không giãn", "không thấy")
        ),
        MedicalTestSentence(
            id = "TEST_005",
            category = "CT bụng",
            referenceText = "Đường mật trong gan không giãn, không thấy sỏi tăng tỷ trọng.",
            keyTerms = listOf("đường mật", "sỏi", "tăng tỷ trọng"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("đường mật trong gan"),
            keyNegations = listOf("không giãn", "không thấy")
        ),
        MedicalTestSentence(
            id = "TEST_006",
            category = "CT bụng",
            referenceText = "Thận trái có vài nang vỏ thận, kích thước nang lớn nhất 22 × 16 mm.",
            keyTerms = listOf("nang vỏ thận", "nang"),
            keyNumbers = listOf("22 × 16 mm"),
            keyAnatomy = listOf("thận trái", "thận"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_007",
            category = "CT bụng",
            referenceText = "Túi mật thành mỏng, dịch mật đồng nhất, không thấy sỏi cản quang.",
            keyTerms = listOf("thành mỏng", "dịch mật", "sỏi cản quang"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("túi mật"),
            keyNegations = listOf("không thấy")
        ),
        MedicalTestSentence(
            id = "TEST_008",
            category = "CT bụng",
            referenceText = "Tụy kích thước trong giới hạn bình thường, ngấm thuốc đồng nhất, ống Wirsung không giãn.",
            keyTerms = listOf("ngấm thuốc đồng nhất", "ống wirsung"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("tụy", "ống wirsung"),
            keyNegations = listOf("không giãn")
        ),
        MedicalTestSentence(
            id = "TEST_009",
            category = "CT bụng",
            referenceText = "Lách không to, nhu mô đồng nhất, không thấy tổn thương khu trú.",
            keyTerms = listOf("nhu mô", "tổn thương khu trú"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("lách"),
            keyNegations = listOf("không to", "không thấy")
        ),
        MedicalTestSentence(
            id = "TEST_010",
            category = "CT bụng",
            referenceText = "Không thấy dịch tự do trong khoang phúc mạc và tiểu khung.",
            keyTerms = listOf("dịch tự do", "khoang phúc mạc"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("tiểu khung", "phúc mạc"),
            keyNegations = listOf("không thấy")
        ),

        // === 2. CT NGỰC (Chest CT) ===
        MedicalTestSentence(
            id = "TEST_011",
            category = "CT ngực",
            referenceText = "Nốt đặc thùy trên phổi phải, kích thước 6 mm, bờ đều, không có tua gai.",
            keyTerms = listOf("nốt đặc", "bờ đều", "tua gai"),
            keyNumbers = listOf("6 mm"),
            keyAnatomy = listOf("thùy trên phổi phải", "phổi"),
            keyNegations = listOf("không có")
        ),
        MedicalTestSentence(
            id = "TEST_012",
            category = "CT ngực",
            referenceText = "Nốt kính mờ thùy dưới phổi trái kích thước 8 mm, không thấy co kéo màng phổi lân cận.",
            keyTerms = listOf("nốt kính mờ", "co kéo"),
            keyNumbers = listOf("8 mm"),
            keyAnatomy = listOf("thùy dưới phổi trái", "màng phổi"),
            keyNegations = listOf("không thấy")
        ),
        MedicalTestSentence(
            id = "TEST_013",
            category = "CT ngực",
            referenceText = "Tổn thương đông đặc kèm hình ảnh phế quản khí thùy giữa phổi phải.",
            keyTerms = listOf("đông đặc", "phế quản khí"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("thùy giữa phổi phải"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_014",
            category = "CT ngực",
            referenceText = "Không thấy tràn dịch, tràn khí khoang màng phổi hai bên.",
            keyTerms = listOf("tràn dịch", "tràn khí", "khoang màng phổi"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("màng phổi"),
            keyNegations = listOf("không thấy")
        ),
        MedicalTestSentence(
            id = "TEST_015",
            category = "CT ngực",
            referenceText = "Vài nốt vôi hóa nhỏ rải rác khe liên thùy phổi hai bên, nghĩ nốt di chứng.",
            keyTerms = listOf("vôi hóa", "khe liên thùy", "di chứng"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("khe liên thùy", "phổi"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_016",
            category = "CT ngực",
            referenceText = "Trung thất không thấy hạch lớn, kích thước hạch nhỏ hơn 10 mm trên trục ngắn.",
            keyTerms = listOf("trung thất", "hạch lớn", "trục ngắn"),
            keyNumbers = listOf("10 mm"),
            keyAnatomy = listOf("trung thất", "hạch"),
            keyNegations = listOf("không thấy")
        ),

        // === 3. CT SỌ NÃO (Brain CT) ===
        MedicalTestSentence(
            id = "TEST_017",
            category = "CT sọ não",
            referenceText = "Nhu mô não không thấy ổ tổn thương giảm tỷ trọng dạng nhồi máu hay tăng tỷ trọng dạng xuất huyết.",
            keyTerms = listOf("nhu mô não", "giảm tỷ trọng", "nhồi máu", "tăng tỷ trọng", "xuất huyết"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("nhu mô não"),
            keyNegations = listOf("không thấy")
        ),
        MedicalTestSentence(
            id = "TEST_018",
            category = "CT sọ não",
            referenceText = "Hệ thống não thất và các rãnh cuộn não hai bên giãn nhẹ phù hợp teo não tuổi già.",
            keyTerms = listOf("não thất", "rãnh cuộn não", "teo não"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("não thất", "rãnh cuộn não"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_019",
            category = "CT sọ não",
            referenceText = "Đường giữa cân đối, không thấy hiệu ứng khối đè đẩy hay thoát vị não.",
            keyTerms = listOf("đường giữa", "hiệu ứng khối", "đè đẩy", "thoát vị não"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("đường giữa", "não"),
            keyNegations = listOf("không thấy")
        ),
        MedicalTestSentence(
            id = "TEST_020",
            category = "CT sọ não",
            referenceText = "Ổ giảm tỷ trọng chất trắng cạnh não thất bên hai bên, nghĩ tổn thương thiếu máu cục bộ mạn tính.",
            keyTerms = listOf("giảm tỷ trọng", "chất trắng", "thiếu máu cục bộ"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("chất trắng", "não thất bên"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_021",
            category = "CT sọ não",
            referenceText = "Các xoang hàm, xoang trán, xoang sàng và xoang bướm sáng đều, không dày niêm mạc.",
            keyTerms = listOf("sáng đều", "dày niêm mạc"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("xoang hàm", "xoang trán", "xoang sàng", "xoang bướm"),
            keyNegations = listOf("không dày")
        ),

        // === 4. MRI (Magnetic Resonance Imaging) ===
        MedicalTestSentence(
            id = "TEST_022",
            category = "MRI",
            referenceText = "Thoái hóa đĩa đệm L4 L5 kèm phình đĩa đệm tầng nhẹ gây hẹp lỗ liên hợp hai bên.",
            keyTerms = listOf("thoái hóa", "đĩa đệm", "phình đĩa đệm", "hẹp lỗ liên hợp"),
            keyNumbers = listOf("L4 L5"),
            keyAnatomy = listOf("đĩa đệm", "lỗ liên hợp"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_023",
            category = "MRI",
            referenceText = "Thoát vị đĩa đệm trung tâm tầng L5 S1 ra sau 5 mm, chèn ép bao màng cứng.",
            keyTerms = listOf("thoát vị đĩa đệm", "chèn ép", "bao màng cứng"),
            keyNumbers = listOf("5 mm", "L5 S1"),
            keyAnatomy = listOf("đĩa đệm", "bao màng cứng"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_024",
            category = "MRI",
            referenceText = "Tổn thương tăng tín hiệu trên T2 và FLAIR ở chất trắng sâu thùy trán hai bên.",
            keyTerms = listOf("tăng tín hiệu", "T2", "FLAIR", "chất trắng sâu"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("thùy trán", "chất trắng"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_025",
            category = "MRI",
            referenceText = "Khối u ngấm thuốc mạnh sau tiêm đối quang từ, giới hạn rõ, đường kính 18 mm.",
            keyTerms = listOf("đối quang từ", "ngấm thuốc mạnh", "giới hạn rõ"),
            keyNumbers = listOf("18 mm"),
            keyAnatomy = listOf("khối u"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_026",
            category = "MRI",
            referenceText = "Đứt hoàn toàn dây chằng chéo trước khớp gối phải, kèm phù tủy xương lồi cầu ngoài.",
            keyTerms = listOf("đứt hoàn toàn", "dây chằng chéo trước", "phù tủy xương"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("dây chằng chéo trước", "khớp gối phải", "lồi cầu ngoài"),
            keyNegations = emptyList()
        ),

        // === 5. X-QUANG (Radiography) ===
        MedicalTestSentence(
            id = "TEST_027",
            category = "X-quang",
            referenceText = "Bóng tim không to, chỉ số tim lồng ngực nhỏ hơn 0.5.",
            keyTerms = listOf("bóng tim", "chỉ số tim lồng ngực"),
            keyNumbers = listOf("0.5"),
            keyAnatomy = listOf("bóng tim", "lồng ngực"),
            keyNegations = listOf("không to")
        ),
        MedicalTestSentence(
            id = "TEST_028",
            category = "X-quang",
            referenceText = "Hai phế trường sáng đều, không thấy tổn thương đông đặc hay nốt mờ khu trú.",
            keyTerms = listOf("phế trường", "đông đặc", "nốt mờ khu trú"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("phế trường"),
            keyNegations = listOf("không thấy")
        ),
        MedicalTestSentence(
            id = "TEST_029",
            category = "X-quang",
            referenceText = "Góc tâm hoành và góc sườn hoành hai bên nhọn, không thấy tràn dịch màng phổi.",
            keyTerms = listOf("góc tâm hoành", "góc sườn hoành", "tràn dịch"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("góc sườn hoành", "màng phổi"),
            keyNegations = listOf("không thấy")
        ),
        MedicalTestSentence(
            id = "TEST_030",
            category = "X-quang",
            referenceText = "Gãy kín một phần ba giữa xương đòn trái, di lệch chồng ngắn 12 mm.",
            keyTerms = listOf("gãy kín", "di lệch", "chồng ngắn"),
            keyNumbers = listOf("12 mm", "1/3"),
            keyAnatomy = listOf("xương đòn trái"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_031",
            category = "X-quang",
            referenceText = "Vòm hoành hai bên đều, liên tục, không thấy liềm hơi dưới hoành.",
            keyTerms = listOf("vòm hoành", "liềm hơi dưới hoành"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("vòm hoành"),
            keyNegations = listOf("không thấy")
        ),

        // === 6. SIÊU ÂM (Ultrasound) ===
        MedicalTestSentence(
            id = "TEST_032",
            category = "Siêu âm",
            referenceText = "Nhu mô gan dày, tăng âm nhẹ lan tỏa, giảm hút âm vùng sâu, nghĩ gan nhiễm mỡ độ một.",
            keyTerms = listOf("nhu mô gan", "tăng âm", "giảm hút âm", "gan nhiễm mỡ"),
            keyNumbers = listOf("độ 1"),
            keyAnatomy = listOf("nhu mô gan"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_033",
            category = "Siêu âm",
            referenceText = "Túi mật có một sỏi tăng âm kèm bóng cản lưng rõ, đường kính 14 mm, di động theo tư thế.",
            keyTerms = listOf("sỏi tăng âm", "bóng cản lưng", "di động"),
            keyNumbers = listOf("14 mm"),
            keyAnatomy = listOf("túi mật"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_034",
            category = "Siêu âm",
            referenceText = "Thận phải ứ nước độ hai do sỏi đoạn một phần ba trên niệu quản phải kích thước 7 mm.",
            keyTerms = listOf("ứ nước", "sỏi niệu quản"),
            keyNumbers = listOf("độ 2", "7 mm"),
            keyAnatomy = listOf("thận phải", "niệu quản phải"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_035",
            category = "Siêu âm",
            referenceText = "Tuyến giáp hai thùy không to, thùy phải có nhân giảm âm bờ đều TIRADS 3 kích thước 5 × 4 mm.",
            keyTerms = listOf("tuyến giáp", "nhân giảm âm", "bờ đều", "TIRADS 3"),
            keyNumbers = listOf("5 × 4 mm"),
            keyAnatomy = listOf("tuyến giáp", "thùy phải"),
            keyNegations = listOf("không to")
        ),
        MedicalTestSentence(
            id = "TEST_036",
            category = "Siêu âm",
            referenceText = "Không thấy dịch màng phổi, không thấy dịch ổ bụng trên siêu âm.",
            keyTerms = listOf("dịch màng phổi", "dịch ổ bụng"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("màng phổi", "ổ bụng"),
            keyNegations = listOf("không thấy")
        ),

        // === 7. SỐ ĐO (Measurements) ===
        MedicalTestSentence(
            id = "TEST_037",
            category = "Số đo",
            referenceText = "Đường kính ngang chỗ hẹp nhất 1.25 mm, chiều dài đoạn tổn thương 35 mm.",
            keyTerms = listOf("đường kính ngang", "đoạn tổn thương"),
            keyNumbers = listOf("1.25 mm", "35 mm"),
            keyAnatomy = emptyList(),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_038",
            category = "Số đo",
            referenceText = "Khối u kích thước ba chiều 45 × 32 × 28 mm, thể tích ước tính 21 ml.",
            keyTerms = listOf("kích thước ba chiều", "thể tích"),
            keyNumbers = listOf("45 × 32 × 28 mm", "21 ml"),
            keyAnatomy = listOf("khối u"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_039",
            category = "Số đo",
            referenceText = "Động mạch chủ bụng đường kính lớn nhất 32 mm, chưa đủ tiêu chuẩn phình mạch.",
            keyTerms = listOf("động mạch chủ bụng", "phình mạch"),
            keyNumbers = listOf("32 mm"),
            keyAnatomy = listOf("động mạch chủ bụng"),
            keyNegations = listOf("chưa đủ")
        ),
        MedicalTestSentence(
            id = "TEST_040",
            category = "Số đo",
            referenceText = "Hẹp khoảng 70% đến 80% khẩu kính lòng động mạch cảnh trong bên phải.",
            keyTerms = listOf("khẩu kính lòng", "động mạch cảnh trong"),
            keyNumbers = listOf("70%", "80%"),
            keyAnatomy = listOf("động mạch cảnh trong bên phải"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_041",
            category = "Số đo",
            referenceText = "Lớp dịch tự do khoang màng phổi phải dày nhất 15 mm, tương đương mức độ nhẹ.",
            keyTerms = listOf("lớp dịch tự do", "màng phổi"),
            keyNumbers = listOf("15 mm"),
            keyAnatomy = listOf("khoang màng phổi phải"),
            keyNegations = emptyList()
        ),

        // === 8. VỊ TRÍ GIẢI PHẪU (Anatomical Locations) ===
        MedicalTestSentence(
            id = "TEST_042",
            category = "Vị trí giải phẫu",
            referenceText = "Tổn thương nằm ở phân thùy 6 và phân thùy 7 của gan, sát bao Glisson.",
            keyTerms = listOf("phân thùy", "bao Glisson"),
            keyNumbers = listOf("6", "7"),
            keyAnatomy = listOf("phân thùy 6", "phân thùy 7", "gan", "bao glisson"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_043",
            category = "Vị trí giải phẫu",
            referenceText = "Ống mật chủ đoạn sau tụy đường kính 8 mm, không thấy sỏi trong lòng.",
            keyTerms = listOf("ống mật chủ", "sau tụy"),
            keyNumbers = listOf("8 mm"),
            keyAnatomy = listOf("ống mật chủ", "tụy"),
            keyNegations = listOf("không thấy")
        ),
        MedicalTestSentence(
            id = "TEST_044",
            category = "Vị trí giải phẫu",
            referenceText = "Khối u vùng góc hồi manh tràng thâm nhiễm mỡ mạc treo xung quanh.",
            keyTerms = listOf("góc hồi manh tràng", "thâm nhiễm", "mỡ mạc treo"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("góc hồi manh tràng", "mạc treo"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_045",
            category = "Vị trí giải phẫu",
            referenceText = "Đài bể thận và niệu quản một phần ba trên bên trái giãn ứ nước.",
            keyTerms = listOf("đài bể thận", "niệu quản", "ứ nước"),
            keyNumbers = listOf("1/3"),
            keyAnatomy = listOf("đài bể thận", "niệu quản trái"),
            keyNegations = emptyList()
        ),

        // === 9. THUỐC CẢN QUANG (Contrast Agents & Dynamics) ===
        MedicalTestSentence(
            id = "TEST_046",
            category = "Thuốc cản quang",
            referenceText = "Sau tiêm thuốc cản quang, tổn thương ngấm thuốc mạnh thì động mạch và thải thuốc nhanh thì tĩnh mạch.",
            keyTerms = listOf("thuốc cản quang", "ngấm thuốc mạnh", "thì động mạch", "thải thuốc nhanh", "thì tĩnh mạch"),
            keyNumbers = emptyList(),
            keyAnatomy = emptyList(),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_047",
            category = "Thuốc cản quang",
            referenceText = "Nốt ngấm thuốc viền dạng nốt thì động mạch, có xu hướng lấp đầy dần ở thì muộn.",
            keyTerms = listOf("ngấm thuốc viền", "thì động mạch", "lấp đầy dần", "thì muộn"),
            keyNumbers = emptyList(),
            keyAnatomy = emptyList(),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_048",
            category = "Thuốc cản quang",
            referenceText = "Tổn thương kém ngấm thuốc ở tất cả các thì chụp sau tiêm cản quang.",
            keyTerms = listOf("kém ngấm thuốc", "các thì chụp", "tiêm cản quang"),
            keyNumbers = emptyList(),
            keyAnatomy = emptyList(),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_049",
            category = "Thuốc cản quang",
            referenceText = "Nhu mô thận ngấm thuốc bình thường, thời gian bài tiết thuốc qua đài thận hai bên đối xứng.",
            keyTerms = listOf("nhu mô thận", "bài tiết thuốc", "đài thận đối xứng"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("nhu mô thận", "đài thận"),
            keyNegations = emptyList()
        ),

        // === 10. BỆNH LÝ THƯỜNG GẶP (Common Pathologies) ===
        MedicalTestSentence(
            id = "TEST_050",
            category = "Bệnh lý thường gặp",
            referenceText = "Xơ vữa vôi hóa rải rác hệ động mạch chủ - chậu hai bên gây hẹp dưới 50% khẩu kính lòng mạch.",
            keyTerms = listOf("xơ vữa", "vôi hóa", "khẩu kính lòng mạch"),
            keyNumbers = listOf("50%"),
            keyAnatomy = listOf("động mạch chủ - chậu"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_051",
            category = "Bệnh lý thường gặp",
            referenceText = "Hình ảnh dày thành quai ruột non kèm thâm nhiễm mỡ mạc treo xung quanh, gợi ý viêm ruột cấp.",
            keyTerms = listOf("dày thành", "ruột non", "thâm nhiễm mỡ", "viêm ruột cấp"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("quai ruột non", "mạc treo"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_052",
            category = "Bệnh lý thường gặp",
            referenceText = "Trĩ mạch gan bờ không đều, tăng áp lực tĩnh mạch cửa có tuần hoàn bàng hệ cửa chủ.",
            keyTerms = listOf("tăng áp lực tĩnh mạch cửa", "tuần hoàn bàng hệ"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("tĩnh mạch cửa"),
            keyNegations = listOf("không đều")
        ),
        MedicalTestSentence(
            id = "TEST_053",
            category = "Bệnh lý thường gặp",
            referenceText = "Thâm nhiễm nhu mô đỉnh phổi phải dạng lao tiến triển có tạo hang nhỏ kích thước 11 mm.",
            keyTerms = listOf("thâm nhiễm", "lao tiến triển", "tạo hang"),
            keyNumbers = listOf("11 mm"),
            keyAnatomy = listOf("đỉnh phổi phải"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_054",
            category = "Bệnh lý thường gặp",
            referenceText = "Phì đại lành tính tiền liệt tuyến, kích thước khoảng 48 × 42 × 39 mm, lồi vào đáy bàng quang.",
            keyTerms = listOf("phì đại lành tính", "tiền liệt tuyến", "đáy bàng quang"),
            keyNumbers = listOf("48 × 42 × 39 mm"),
            keyAnatomy = listOf("tiền liệt tuyến", "bàng quang"),
            keyNegations = emptyList()
        ),
        MedicalTestSentence(
            id = "TEST_055",
            category = "Bệnh lý thường gặp",
            referenceText = "Viêm túi thừa đại tràng sigma kèm phản ứng viêm thâm nhiễm mỡ xung quanh, chưa thấy biến chứng thủng.",
            keyTerms = listOf("viêm túi thừa", "đại tràng sigma", "phản ứng viêm", "biến chứng thủng"),
            keyNumbers = emptyList(),
            keyAnatomy = listOf("đại tràng sigma"),
            keyNegations = listOf("chưa thấy")
        )
    )

    fun getCategories(): List<String> {
        return SENTENCES.map { it.category }.distinct()
    }

    fun getByCategory(category: String): List<MedicalTestSentence> {
        return SENTENCES.filter { it.category == category }
    }

    fun getById(id: String): MedicalTestSentence? {
        return SENTENCES.firstOrNull { it.id == id }
    }
}
