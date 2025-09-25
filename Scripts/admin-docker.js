#!/usr/bin/env node
import http from "http";
import https from "https";

function parseArgs(argv){const o={};for(let i=2;i<argv.length;i++){const a=argv[i];if(a.startsWith("--")){const k=a.slice(2);const v=argv[i+1]&&!argv[i+1].startsWith("--")?argv[++i]:true;o[k]=v;}}return o;}

async function main(){
  const args=parseArgs(process.argv);
  const base=args.url||process.env.HTTP_BASE_URL||"http://localhost:8765";
  const target=args.target||args.t;
  const token=args.token||process.env.API_TOKEN||"";
  if(!target){console.error("Usage: node scripts/admin-docker.js --target <dev|personal|yoga> [--url http://host:8765] [--token <token>]");process.exit(2);}  
  const url=new URL("/admin/docker-list", base);
  const payload={target};
  const client=url.protocol==="https:"?https:http;
  await new Promise((resolve,reject)=>{
    const data=Buffer.from(JSON.stringify(payload));
    const req=client.request({method:"POST",hostname:url.hostname,port:url.port||(url.protocol==="https:"?443:80),path:url.pathname,headers:{"Content-Type":"application/json","Content-Length":data.length,...(token?{Authorization:`Bearer ${token}`}:{})},rejectUnauthorized:false},(res)=>{
      const chunks=[];res.on("data",c=>chunks.push(c));res.on("end",()=>{const txt=Buffer.concat(chunks).toString("utf8");try{console.log(JSON.stringify(JSON.parse(txt),null,2));}catch{console.log(txt);}if(res.statusCode&&res.statusCode>=400)process.exit(1);resolve();});
    });
    req.on("error",e=>{console.error("Request failed:",e.message);reject(e);});
    req.write(data);req.end();
  });
}

main().catch(e=>{console.error(e.message);process.exit(1);});

