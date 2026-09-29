import re

html_sample = '''<div class="text-diagnosis" contenteditable="true">
<p><strong>KỸ THUẬT:</strong></p>
<p>Chụp cắt lớp vi tính ổ bụng có tiêm thuốc cản quang.</p>
<p><strong>MÔ TẢ:</strong></p>
<p>-- Gan không to, bờ đều, nhu mô đồng nhất, không thấy khối khu trú trước và sau tiêm thuốc cản quang.</p>
<p>-- Đường mật trong và ngoài gan không giãn, không có sỏi.</p>
<p>-- Túi mật không to, thành mỏng, dịch mật đồng nhất, không thấy sỏi.</p>
<p>-- Tụy kích thước bình thường, ngấm thuốc đồng nhất, không thấy khối u, ống Wirsung không giãn.</p>
<p>-- Lách không to, ngấm thuốc đồng nhất, không thấy tổn thương khu trú.</p>
<p>-- Hai thận vị trí bình thường, kích thước bình thường, nhu mô ngấm thuốc đều, không thấy sỏi, không ứ nước.</p>
<p>-- Bàng quang thành mỏng, nhẵn, không thấy sỏi, không có khối sùi.</p>
<p>-- Tuyến tiền liệt kích thước bình thường.</p>
<p>-- Không thấy hạch to trong ổ bụng.</p>
<p>-- Không thấy dịch tự do trong ổ bụng.</p>
<p><strong>KẾT LUẬN:</strong></p>
<p>Hiện tại không thấy hình ảnh bất thường trên phim chụp cắt lớp vi tính ổ bụng.</p>
<table style="width:100%"><tr><td>Bác sĩ thực hiện: BS. Nguyễn Văn A</td></tr></table>
</div>'''

def apply_surgical(html, organ_key, updated_line, conclusion, is_new=False, insert_after="Lách", hach_line=None):
    footer_idx = -1
    m_foot = re.search(r'(?:<h1\b|<table\b)', html, re.I)
    if m_foot:
        footer_idx = m_foot.start()
        body = html[:footer_idx]
        footer = html[footer_idx:]
    else:
        body = html
        footer = ''
        
    organ_patterns = {
        'gan': r'Gan\b',
        'tui_mat': r'Túi\s*mật\b',
        'than': r'(?:Hai\s*thận|Thận\s*phải|Thận\s*trái|Thận)\b',
        'da_day': r'Dạ\s*dày\b',
        'hach': r'(?:Không\s*thấy\s*hạch|Hạch)\b'
    }
    
    if not is_new and organ_key in organ_patterns:
        pat = (r'((?:<p\b[^>]*>)?\s*(?:<strong>|<b>)?\s*(?:--|—|-)?\s*(?:</(?:strong|b)>\s*)?(?:<(?:strong|b)>\s*)?' + 
               organ_patterns[organ_key] + 
               r'(?:</(?:strong|b)>\s*)?[^<\n\r]*(?:<(?!br\b|/p\b|/div\b)[^>]*>[^<\n\r]*)*)(?=(?:<br\s*/?>|</p>|</div>|\n|$))')
        def repl_org(m):
            prefix = '<p>' if '<p' in m.group(0) else ''
            return prefix + updated_line
        body = re.sub(pat, repl_org, body, count=1, flags=re.I)
    elif is_new:
        anchor_pat = r'(<p\b[^>]*>.*?' + insert_after + r'.*?</p>)'
        body = re.sub(anchor_pat, r'\1\n<p>' + updated_line + '</p>', body, count=1, flags=re.I)
        
    if hach_line:
        hach_pat = (r'((?:<p\b[^>]*>)?\s*(?:--|—|-)?\s*(?:Không\s*thấy\s*hạch|Hạch)[^<\n\r]*(?:<(?!br\b|/p\b|/div\b)[^>]*>[^<\n\r]*)*)(?=(?:<br\s*/?>|</p>|</div>|\n|$))')
        body = re.sub(hach_pat, lambda m: ('<p>' if '<p' in m.group(0) else '') + hach_line, body, count=1, flags=re.I)
        
    # Conclusion
    kl_regex = re.compile(
        r'((?:<p\b[^>]*>)?\s*(?:<strong>|<b>)?\s*KẾT\s*LUẬN\s*(?:</strong>|</b>)?\s*:\s*(?:</strong>|</b>)?\s*(?:</p>)?\s*(?:<br\s*/?>|\s*|\n)*)(?:<p\b[^>]*>)?[\s\S]*?(?:</p>)?(?=\s*(?:<table|<h1|$))',
        re.IGNORECASE
    )
    body = kl_regex.sub(lambda m: m.group(1).rstrip() + '\n<p>' + conclusion + '</p>', body)
    return body + footer

res1 = apply_surgical(
    html_sample,
    'gan',
    '-- Gan không to, bờ đều, nhu mô gan trái có nang đường kính 5mm.',
    'Hình ảnh nang gan trái.'
)
print("=== CASE 1: NANG GAN TRAI ===")
print(res1)

res2 = apply_surgical(
    html_sample,
    'da_day',
    '-- Dạ dày: Dày không đều thành hang - môn vị dạ dày, chỗ dày nhất 21mm, gây hẹp lòng môn vị, sau tiêm ngấm thuốc mạnh không đều, mất cấu trúc lớp, thâm nhiễm mỡ nhẹ xung quanh.',
    'Hình ảnh dày thành không đều hang - môn vị dạ dày gây hẹp lòng môn vị, kèm vài hạch lân cận.',
    is_new=True,
    insert_after="Lách",
    hach_line='-- Hạch: Lân cận có vài hạch (khoảng 6-7 hạch), hạch lớn kích thước 21x8mm, bờ không đều, sau tiêm ngấm thuốc không đồng nhất.'
)
print("\n=== CASE 2: DA DAY + HACH ===")
print(res2)
