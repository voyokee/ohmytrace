package com.ohmytrace.app;
import org.junit.Test;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import static org.junit.Assert.*;
public class DocumentWriteSessionTest {
    @Test public void orderedChunksCompleteExactlyOnceAndPreserveBytes() throws Exception {
        ByteArrayOutputStream out=new ByteArrayOutputStream();int[] deleted={0};DocumentWriteSession s=new DocumentWriteSession(4,out,()->deleted[0]++);
        s.append(0,new byte[]{1,2});s.append(2,new byte[]{3,4});assertEquals(4,s.finish());assertArrayEquals(new byte[]{1,2,3,4},out.toByteArray());s.cancel();assertEquals(0,deleted[0]);
        try{s.append(4,new byte[]{5});fail();}catch(IOException expected){}
    }
    @Test public void truncatedOrOutOfOrderWritesCannotBecomeSuccessfulDocuments() throws Exception {
        int[] deleted={0};DocumentWriteSession partial=new DocumentWriteSession(3,new ByteArrayOutputStream(),()->deleted[0]++);partial.append(0,new byte[]{1});try{partial.finish();fail();}catch(IOException expected){}assertEquals(1,deleted[0]);
        DocumentWriteSession order=new DocumentWriteSession(3,new ByteArrayOutputStream(),()->deleted[0]++);try{order.append(1,new byte[]{1});fail();}catch(IOException expected){}assertEquals(2,deleted[0]);order.cancel();assertEquals(2,deleted[0]);
    }
    @Test public void cancellationDiskFailureAndCapacityLimitsCleanUp() throws Exception {
        int[] deleted={0};DocumentWriteSession cancelled=new DocumentWriteSession(1,new ByteArrayOutputStream(),()->deleted[0]++);cancelled.cancel();cancelled.cancel();assertEquals(1,deleted[0]);
        DocumentWriteSession broken=new DocumentWriteSession(1,new java.io.OutputStream(){public void write(int b)throws IOException{throw new IOException("disk full");}},()->deleted[0]++);try{broken.append(0,new byte[]{1});fail();}catch(IOException expected){}assertEquals(2,deleted[0]);
        for(long size:new long[]{-1,Long.MAX_VALUE})try{DocumentWriteSession.validateSize(size);fail();}catch(IllegalArgumentException expected){}
        DocumentWriteSession bounded=new DocumentWriteSession(300000,new ByteArrayOutputStream(),()->deleted[0]++);try{bounded.append(0,new byte[262145]);fail();}catch(IOException expected){}assertEquals(3,deleted[0]);
        assertEquals("a_b_c_.gpx",DocumentWriteSession.fileName("a/b:c?.gpx"));
    }
}
