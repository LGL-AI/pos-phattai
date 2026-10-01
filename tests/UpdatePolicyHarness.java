import vn.lotusai.pos.phattaiapp.UpdatePolicy;

public final class UpdatePolicyHarness {
    private static final String ID="vn.lotusai.pos.phattaiapp",SIGN="9a3049ab6b940be51cea4e22ba4d0ecc8a1d6490f0827d461b7a1f3c3ae860ae",HASH="a".repeat(64);
    private static int checks;
    private static UpdatePolicy.Installed installed=new UpdatePolicy.Installed(ID,SIGN,162);
    private static UpdatePolicy.Release release(String id,String signer,String name,long code,String hash,long size,int sdk,String path){
        return new UpdatePolicy.Release(id,signer,name,code,hash,size,sdk,path);
    }
    private static String path(long code,String hash){return "/releases/android/"+ID+"/v"+code+"/"+hash+".apk";}
    private static UpdatePolicy.Release good(){return release(ID,SIGN,"1.6.3",163,HASH,100,23,path(163,HASH));}
    private static void accept(Runnable action){action.run();checks++;}
    private static void reject(Runnable action){try{action.run();throw new AssertionError("Unsafe update accepted");}catch(SecurityException expected){checks++;}}
    public static void main(String[] args){
        accept(()->UpdatePolicy.requireRelease(installed,good(),30));
        accept(()->UpdatePolicy.requireDownloaded(installed,good(),30,100,HASH,new UpdatePolicy.Installed(ID,SIGN,163),"1.6.3"));
        reject(()->UpdatePolicy.requireRelease(installed,release("vn.lotusai.pos.handheld",SIGN,"1.6.3",163,HASH,100,23,path(163,HASH)),30));
        reject(()->UpdatePolicy.requireRelease(installed,release(ID,"b".repeat(64),"1.6.3",163,HASH,100,23,path(163,HASH)),30));
        reject(()->UpdatePolicy.requireRelease(installed,release(ID,null,"1.6.3",163,HASH,100,23,path(163,HASH)),30));
        for(long code:new long[]{161,162,2147483648L})reject(()->UpdatePolicy.requireRelease(installed,release(ID,SIGN,"1.6.3",code,HASH,100,23,path(code,HASH)),30));
        for(String hash:new String[]{null,"bad","A".repeat(64)})reject(()->UpdatePolicy.requireRelease(installed,release(ID,SIGN,"1.6.3",163,hash,100,23,path(163,hash)),30));
        for(long size:new long[]{0,-1,UpdatePolicy.MAX_APK_BYTES+1})reject(()->UpdatePolicy.requireRelease(installed,release(ID,SIGN,"1.6.3",163,HASH,size,23,path(163,HASH)),30));
        for(int sdk:new int[]{22,31})reject(()->UpdatePolicy.requireRelease(installed,release(ID,SIGN,"1.6.3",163,HASH,100,sdk,path(163,HASH)),30));
        for(String url:new String[]{"https://evil.test/update.apk","//evil.test/update.apk","/releases/android/../update.apk",path(164,HASH)})reject(()->UpdatePolicy.requireRelease(installed,release(ID,SIGN,"1.6.3",163,HASH,100,23,url),30));
        reject(()->UpdatePolicy.requireRelease(installed,release(ID,SIGN,"<script>",163,HASH,100,23,path(163,HASH)),30));
        reject(()->UpdatePolicy.requireDownloaded(installed,good(),30,99,HASH,new UpdatePolicy.Installed(ID,SIGN,163),"1.6.3"));
        reject(()->UpdatePolicy.requireDownloaded(installed,good(),30,100,"b".repeat(64),new UpdatePolicy.Installed(ID,SIGN,163),"1.6.3"));
        reject(()->UpdatePolicy.requireDownloaded(installed,good(),30,100,HASH,null,null));
        reject(()->UpdatePolicy.requireDownloaded(installed,good(),30,100,HASH,new UpdatePolicy.Installed("vn.lotusai.pos.handheld",SIGN,163),"1.6.3"));
        reject(()->UpdatePolicy.requireDownloaded(installed,good(),30,100,HASH,new UpdatePolicy.Installed(ID,"b".repeat(64),163),"1.6.3"));
        reject(()->UpdatePolicy.requireDownloaded(installed,good(),30,100,HASH,new UpdatePolicy.Installed(ID,SIGN,162),"1.6.3"));
        reject(()->UpdatePolicy.requireDownloaded(installed,good(),30,100,HASH,new UpdatePolicy.Installed(ID,SIGN,163),"1.6.2"));
        System.out.println("PASS "+checks+" native Java update policy cases");
    }
}
