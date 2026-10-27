import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildWeb} from './build-web.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
await buildWeb();
const wrapper=resolve(root,'android/gradle/wrapper/gradle-wrapper.jar');
if(!existsSync(wrapper))throw new Error('缺少 Android Gradle Wrapper');
// Invoke Java directly: works with paths containing spaces and avoids shell
// interpolation of Gradle arguments on Windows.
const executable=process.env.JAVA_HOME?resolve(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):'java';
const result=spawnSync(executable,['-classpath',wrapper,'org.gradle.wrapper.GradleWrapperMain','--no-daemon','testDebugUnitTest','assembleDebug',...process.argv.slice(2)],{cwd:resolve(root,'android'),stdio:'inherit',shell:false});
if(result.error)throw new Error('Android 构建需要 JDK 17、Android SDK 35 和 Gradle 8.11.1：'+result.error.message);
process.exitCode=result.status??1;
