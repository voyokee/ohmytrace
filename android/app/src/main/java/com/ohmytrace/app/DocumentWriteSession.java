package com.ohmytrace.app;
import java.io.IOException;
import java.io.OutputStream;

/** An unfinished SAF document is never reported as a saved backup. */
final class DocumentWriteSession {
    private final long size;
    private final OutputStream output;
    private final Runnable removePartial;
    private long written;
    private boolean closed,complete,removed;
    static void validateSize(long size){if(size<0||size>512L*1024*1024)throw new IllegalArgumentException("保存文件容量超限");}
    static String fileName(String name){String value=(name==null?"":name).replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]","_").replaceAll("[. ]+$","").trim();if(value.isEmpty())value="OnceHere-文件";return value.substring(0,Math.min(120,value.length()));}
    DocumentWriteSession(long size,OutputStream output,Runnable removePartial){validateSize(size);this.size=size;this.output=output;this.removePartial=removePartial;}
    synchronized void append(long offset,byte[] bytes)throws IOException{
        if(closed)throw new IOException("保存任务已结束");
        if(offset!=written||bytes.length>262144||bytes.length>size-written){cancel();throw new IOException("保存文件顺序或容量不符");}
        try{output.write(bytes);written+=bytes.length;}catch(IOException error){cancel();throw error;}
    }
    synchronized long finish()throws IOException{
        if(closed)throw new IOException("保存任务已结束");if(written!=size){cancel();throw new IOException("保存文件不完整");}
        try{output.flush();output.close();closed=true;complete=true;return written;}catch(IOException error){cancel();throw error;}
    }
    synchronized void cancel(){if(!closed){closed=true;try{output.close();}catch(IOException ignored){}}if(!complete&&!removed){removed=true;try{removePartial.run();}catch(RuntimeException ignored){}}}
}
