import {inflateRawSync} from 'node:zlib';
function centralDirectory(buffer){
 let end=-1;
 for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break}
 if(end<0)throw Error('APK has no ZIP central directory');
 return {count:buffer.readUInt16LE(end+10),offset:buffer.readUInt32LE(end+16)};
}
// Read the APK central directory rather than spawning platform-specific unzip.
export function apkEntries(buffer){
 const directory=centralDirectory(buffer),count=directory.count;let offset=directory.offset;const files=new Map();
 for(let i=0;i<count;i++){
  if(buffer.readUInt32LE(offset)!==0x02014b50)throw Error('Invalid APK central directory');
  const method=buffer.readUInt16LE(offset+10),compressed=buffer.readUInt32LE(offset+20),size=buffer.readUInt32LE(offset+24);
  const nameLength=buffer.readUInt16LE(offset+28),extraLength=buffer.readUInt16LE(offset+30),commentLength=buffer.readUInt16LE(offset+32),local=buffer.readUInt32LE(offset+42);
  const name=buffer.toString('utf8',offset+46,offset+46+nameLength);
  files.set(name,()=>{
   if(size>32*1024*1024||buffer.readUInt32LE(local)!==0x04034b50)throw Error('Invalid or oversized APK entry: '+name);
   const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
   if(start+compressed>buffer.length)throw Error('Truncated APK entry: '+name);
   const input=buffer.subarray(start,start+compressed);
   const data=method===0?input:method===8?inflateRawSync(input,{maxOutputLength:32*1024*1024}):null;
   if(!data||data.length!==size)throw Error('Invalid APK compression or size: '+name);
   return data;
  });
  offset+=46+nameLength+extraLength+commentLength;
 }
 return files;
}

export function apkHasSigningMaterial(buffer,entries=apkEntries(buffer)){
 if([...entries.keys()].some(name=>/^META-INF\/[^/]+\.(RSA|DSA|EC)$/i.test(name)))return true;
 const {offset}=centralDirectory(buffer);
 return offset>=16&&buffer.subarray(offset-16,offset).equals(Buffer.from('APK Sig Block 42'));
}
