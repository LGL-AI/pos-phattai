#!/usr/bin/env python3
import argparse, os
import qrcode
from PIL import Image, ImageDraw, ImageFont

p=argparse.ArgumentParser()
p.add_argument('--url', default='https://pos-phattai.lgl247-ai.workers.dev/qr/')
p.add_argument('--out', default='PHAT_TAI_QR_GOI_MON_CHON_BAN.png')
a=p.parse_args()
qr=qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_Q,box_size=14,border=4)
qr.add_data(a.url); qr.make(fit=True)
im=qr.make_image(fill_color='black',back_color='white').convert('RGB')
w,h=im.size
canvas=Image.new('RGB',(w,h+120),'white'); canvas.paste(im,(0,0)); d=ImageDraw.Draw(canvas)
try:
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',28)
    small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',20)
except Exception:
    font=small=ImageFont.load_default()
lines=['PHÁT TÀI · QUÉT MÃ GỌI MÓN','QUÉT QR → CHỌN BÀN → CHỌN MÓN']
y=h+18
for text,f in zip(lines,[font,small]):
    b=d.textbbox((0,0),text,font=f); d.text(((w-(b[2]-b[0]))/2,y),text,fill='black',font=f); y+=42
canvas.save(a.out)
with open(os.path.splitext(a.out)[0]+'.txt','w',encoding='utf-8') as f:f.write(a.url+'\n')
print(a.out)
