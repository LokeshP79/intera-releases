(function(root){
 // Conservative fast path for complete, explicit requests. Ambiguous turns use the classifier.
 function clearQuestion(text){
  const q=String(text||'').trim().replace(/^(?:(?:okay|ok|so|all right|alright|well)[,.!]?\s+)+/i,'');
  if(!q||/\b(?:and|or|because|about|through|when|if|to|the|a|an|your|my|our|their)\s*[,.]?$/i.test(q))return false;
  if(/^(?:why|how so|why not|what happened next|can you elaborate)\?$/i.test(q))return true;
  const words=q.match(/[\p{L}\p{N}]+/gu)||[];
  if(words.length<4)return false;
  if(/^(?:tell me about|walk me through|describe|explain|give (?:me|us) (?:an? )?example|introduce yourself)\b/i.test(q))return true;
  return /\?\s*$/.test(q)&&/^(?:what|why|how|when|where|which|who|can you|could you|would you|do you|did you|have you|are you|is there)\b/i.test(q);
 }
 if(typeof module!=='undefined')module.exports={clearQuestion};else root.clearQuestion=clearQuestion;
})(globalThis);
