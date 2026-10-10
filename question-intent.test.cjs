const {test}=require('node:test'),assert=require('node:assert/strict');
const {clearQuestion}=require('../question-intent');
test('clear requests are recognized without treating narrative and unfinished clauses as questions',()=>{
 for(const text of ['Tell me about yourself.','Walk me through your latest project.','What did you learn from that?','Okay, how did you fix the problem?','Why?'])assert.equal(clearQuestion(text),true,text);
 for(const text of ['Thanks, that makes sense.','I was asked what I did.','Tell me about your','Tell me about the','Can you tell me about','We explain how the system works.'])assert.equal(clearQuestion(text),false,text);
});
