/*jshint -W003, -W097, -W117, -W026 */
'use strict';
var Promise = require('bluebird');
var noteService = require('../../service/notes.service');
var encounterService = require('../../service/openmrs-rest/encounter.js')
var db = require('../../etl-db');
var _ = require('underscore');
var reportFactory = require('../../etl-factory');
var Boom = require('boom'); //extends Hapi Error Reporting. Returns HTTP-friendly error objects: github.com/hapijs/boom
var helpers = require('../../etl-helpers');
var http = require('http');
var https = require('https');
var Promise=require('bluebird');
var rp = require('../../request-config');
var config = require('../../conf/config');
var moment=require('moment');
var eidObs=require('../../eid-obs-compare');
module.exports = function() {
  function getEIDResource(){
    var link=config.eid.uri+config.eid.port+config.eid.path;
    return link;
  }
  function getRestResource(path){
    var link=config.rest.uri+config.rest.port+path;
    return link;
  }
  function getEIDCD4PanelResource(){
    var link=config.eidCD4Panel.uri+config.eidCD4Panel.port+config.eidCD4Panel.path;
    return link;
  }
  function getPatientIdentifiers(patientUuId){
    var uri=module.exports.getRestResource('/amrs/ws/rest/v1/patient/'+patientUuId);
    var queryString={
      v:'full'
    }
  return new Promise(function(resolve, reject) {
    rp.getRequestPromise(queryString,uri)
      .then(function(response) {
        var patientIdentifiers={
          identifiers:[]
        }
        _.each(response.identifiers,function(identifier){
          patientIdentifiers.identifiers.push(identifier.identifier);
          var hasALetterRegEx=/[a-z]/i;
          if(hasALetterRegEx.test(identifier.identifier)){
          var indexOfFirstLetter=identifier.identifier.match(/[a-z]/i).index;
          var identifierWithSpace = identifier.identifier.substr(0, indexOfFirstLetter) +
           ' '+ identifier.identifier.substr(indexOfFirstLetter);
           patientIdentifiers.identifiers.push(identifierWithSpace);
         }
        })
        resolve(patientIdentifiers);
      })
      .catch(function(err) {
        // API call failed...
        resolve(err);
      });
  });
}
function getEIDTestResultsByPatientIdentifier(patientIdentifier){
  var results={
    patientIdentifier: patientIdentifier
  }
  var viralLoadResults=module.exports.getEIDViralLoadTestResultsByPatientIdentifier(patientIdentifier);
  var pcrResults=module.exports.getEIDPCRTestResultsByPatientIdentifier(patientIdentifier);
  var cd4Panel=module.exports.getEIDCD4PanelTestResultsByPatientIdentifier(patientIdentifier);
  return new Promise(function(resolve,reject){
    viralLoadResults.then(function(vlData){
      results.viralLoad=vlData;
      return pcrResults
    })
    .then(function(pcrData){
      results.pcr=pcrData;
      return cd4Panel
    })
    .then(function(cd4Data){
      results.cd4Panel=cd4Data;
      resolve(results);
    })
    .catch(function(error){
      reject(error);
    })
});
}
function getAllEIDTestResultsByPatientUuId(patientUuId){
  var allResults=[];
    var promiseArray=[];
    return new Promise(function(resolve,reject){
      module.exports.getPatientIdentifiers(patientUuId).then(function(response){
        _.each(response.identifiers,function(identifier){
          var promise=module.exports.getEIDTestResultsByPatientIdentifier(identifier);
          promiseArray.push(promise);
        });
        return Promise.all(promiseArray);
      })
      .then(function(response){
        resolve(response);
      })
      .catch(function(error){
        resolve(error);
      })
  });
}
function getPatientTestObsByConceptUuId(conceptUuId,patientUuId){
  var patientObs=[];
  var uri=module.exports.getRestResource('/amrs/ws/rest/v1/obs/');
  var queryString={
    patient:patientUuId,
    concept:conceptUuId,
    v:'full'
  }
  return new Promise(function(resolve,reject){
    rp.getRequestPromise(queryString,uri)
    .then(function(response){
      _.each(response.results,function(data){
        patientObs.push(data);
      });
      resolve(patientObs);
    })
    .catch(function(error){
      reject(error);
    })
  })
}
function getPatientAllTestObsByPatientUuId(patientUuId){
  var allPatientObs={
    obs:[]
  }

  var labConcepts={
    concepts:[
      {"conceptId":657,"uuid":"a896cce6-1350-11df-a1f1-0026b9348838"},
      {"conceptId":9238,"uuid":"457c741d-8f71-4829-b59d-594e0a618892"},
      {"conceptId":1238,"uuid":"a89b5856-1350-11df-a1f1-0026b9348838"},
      {"conceptId":856,"uuid":"a8982474-1350-11df-a1f1-0026b9348838"},
      {"conceptId":1030,"uuid":"a898fe80-1350-11df-a1f1-0026b9348838"}
    ]
  }
  var promiseArray=[];
  return new Promise(function(resolve,reject){
  _.each(labConcepts.concepts,function(testObject){
    var labConceptUuId=testObject.uuid;
     var result=module.exports.getPatientTestObsByConceptUuId(labConceptUuId,patientUuId);
     promiseArray.push(result);
  });

    Promise.all(promiseArray).then(function(response){
      var concatenatedArray = [].concat.apply([], response);
      resolve(concatenatedArray);
    })
    .catch(function(error){
      resolve(error);
    })
});
}
function getEIDViralLoadTestResultsByPatientIdentifier(patientIdentifier){
  var uri=module.exports.getEIDResource();
  var queryString={
    apikey:config.apiKey.commonKey,
    startDate:'2006-01-01',
    endDate:'2016-07-01',
    test:2,
    patientID:patientIdentifier
  }
  return new Promise(function(resolve,reject){
    rp.getRequestPromise(queryString,uri)
    .then(function(response){
      resolve(response.posts);
    })
    .catch(function(error){
      resolve(error);
    })
  })
}
function getEIDPCRTestResultsByPatientIdentifier(patientIdentifier){
  var uri=module.exports.getEIDResource();
  var queryString={
    apikey:config.apiKey.commonKey,
    startDate:'2006-01-01',
    endDate:'2016-07-01',
    test:1,
    patientID:patientIdentifier
  }
  return new Promise(function(resolve,reject){
    rp.getRequestPromise(queryString,uri)
    .then(function(response){
      resolve(response.posts);
    })
    .catch(function(error){
      resolve(error);
    })
  })
}
function getEIDCD4PanelTestResultsByPatientIdentifier(patientIdentifier){
  var uri=module.exports.getEIDCD4PanelResource();
  var queryString={
    apikey:config.apiKey.cd4Key,
    startDate:'2006-01-01',
    endDate:'2016-07-01',
    patientID:patientIdentifier
  }
  return new Promise(function(resolve,reject){
    rp.getRequestPromise(queryString,uri)
    .then(function(response){
      resolve(response.posts);
    })
    .catch(function(error){
      resolve(error);
    })
  })
}
function postObsToAMRS(payload,patientUuId){
    var uri=module.exports.getRestResource('/amrs/ws/rest/v1/obs');
  return new Promise(function(resolve,reject){
    rp.postRequestPromise(payload,uri)
    .then(function(response){
      resolve(response);
    })
    .catch(function(error){
      reject(error);
    })
  });
}
function postAllObsToAMRS(payload,patientUuId){
    var hasNumbersOnly = /^[0-9]*(?:\.\d{1,2})?$/;
    var hasLessThanSymbol=/</g;
    var promisesViralLoadlAll=[];
    var promisesCd4All=[];
    var promisesDnaPcrAll=[];
      if(payload.viralLoad.length >0){
        _.each(payload.viralLoad,function(viralLoadPayload){
          var valid=module.exports.checkStatusOfViralLoad(viralLoadPayload);
          if(valid==1){
            var restConsumablePayload=module.exports.convertViralLoadPayloadToRestConsumableObs(viralLoadPayload,patientUuId);
           promisesViralLoadlAll.push(module.exports.postObsToAMRS(restConsumablePayload,patientUuId));
          }
          else if(valid==0){
            var restConsumablePayload=module.exports.convertViralLoadWithLessThanToRestConsumableObs(viralLoadPayload,patientUuId);
           promisesViralLoadlAll.push(module.exports.postObsToAMRS(restConsumablePayload,patientUuId));
          }
          else{
            var restConsumablePayload=module.exports.convertViralLoadExceptionToRestConsumableObs(viralLoadPayload,patientUuId);
           promisesViralLoadlAll.push(module.exports.postObsToAMRS(restConsumablePayload,patientUuId));
          }
        });
      }
      if(payload.cd4Panel.length >0){
        _.each(payload.cd4Panel,function(cd4Payload){
          var cd4PanelHasValidData=module.exports.cd4PanelHasValidData(cd4Payload);
          var cd4PanelHasErrors=module.exports.cd4PanelHasErrors(cd4Payload);
          if(cd4PanelHasValidData){
            var cd4Data=module.exports.generateCd4ValidData(cd4Payload);
            var restConsumablePayload=module.exports.convertCD4PayloadTORestConsumableObs(cd4Data,patientUuId);
            promisesCd4All.push(module.exports.postObsToAMRS(restConsumablePayload,patientUuId));
          }
          if(cd4PanelHasErrors){
            var cd4Exceptions=module.exports.generateCd4Exceptions(cd4Payload);
            var restConsumablePayload=module.exports.convertCD4ExceptionTORestConsumableObs(cd4Exceptions,patientUuId);
            promisesCd4All.push(module.exports.postObsToAMRS(restConsumablePayload,patientUuId));
          }
        });
      }
      if(payload.pcr.length >0){
        _.each(payload.pcr,function(pcrPayload){
          var restConsumablePayload=module.exports.convertDNAPCRPayloadTORestConsumableObs(pcrPayload,patientUuId);
          promisesDnaPcrAll.push(module.exports.postObsToAMRS(restConsumablePayload,patientUuId));
        });
      }
      return new Promise(function(resolve,reject){
        Promise.all(promisesViralLoadlAll,promisesCd4All,promisesDnaPcrAll)
        .then(function(response){
          resolve(response)
        })
        .catch(function(error){
          reject(error);
        });
      });
  }
  function removeWhiteSpace(string){
    return string.replace(/\s+/g, '');
  }
  function checkStatusOfViralLoad(viralLoadPayload){
    var status=0;
    var hasNumbersOnly = /^[0-9]*(?:\.\d{1,2})?$/;
    var hasLessThanSymbol=/</g;
    var viralLoadResult = module.exports.removeWhiteSpace(viralLoadPayload.FinalResult);
    if(hasNumbersOnly.test(viralLoadResult)){
      status=1;
    }
    else if(hasLessThanSymbol.test(viralLoadResult)){
      status=0;
    }
    else{
      status=-1;
    }
    return status;
  }
  function isViralLoadError(viralLoadPayload){
    var isError=false;
    var hasNumbersOnly = /^[0-9]*(?:\.\d{1,2})?$/;
    var hasLessThanSymbol=/</g;
    var viralLoadResult = module.exports.removeWhiteSpace(viralLoadPayload.FinalResult);
    if(!hasNumbersOnly.test(viralLoadResult) && !hasLessThanSymbol.test(viralLoadResult)){
      isError=true;
    }
    return isError;
  }
  function cd4PanelHasErrors(cd4Payload){
    var hasErrors=false;
    var exceptions=[];
    var hasNumbersOnly = /^[0-9]*(?:\.\d{1,2})?$/;
    var hasLessThanSymbol=/</g;
    var AVGCD3percentLymphResult=module.exports.removeWhiteSpace(cd4Payload.AVGCD3percentLymph);
    var AVGCD3AbsCntResult=module.exports.removeWhiteSpace(cd4Payload.AVGCD3AbsCnt);
    var AVGCD3CD4percentLymphResult=module.exports.removeWhiteSpace(cd4Payload.AVGCD3CD4percentLymph);
    var AVGCD3CD4AbsCntResult=module.exports.removeWhiteSpace(cd4Payload.AVGCD3CD4AbsCnt);
    var CD45AbsCntResult=module.exports.removeWhiteSpace(cd4Payload.CD45AbsCnt);
    if(!hasNumbersOnly.test(AVGCD3percentLymphResult)){
      exceptions.push(AVGCD3percentLymphResult);
    }
    if(!hasNumbersOnly.test(AVGCD3AbsCntResult)){
      exceptions.push(AVGCD3AbsCntResult);
    }
    if(!hasNumbersOnly.test(AVGCD3CD4percentLymphResult)){
      exceptions.push(AVGCD3CD4percentLymphResult);
    }
    if(!hasNumbersOnly.test(AVGCD3CD4AbsCntResult)){
      exceptions.push(AVGCD3CD4AbsCntResult);
    }
    if(!hasNumbersOnly.test(CD45AbsCntResult)){
      exceptions.push(CD45AbsCntResult);
    }
    if(exceptions.length>0){
      hasErrors=true;
    }
    return hasErrors;
  }
  function cd4PanelHasValidData(cd4Payload){
    var hasValidData=false;
    var validData=[];
    var hasNumbersOnly = /^[0-9]*(?:\.\d{1,2})?$/;
    var hasLessThanSymbol=/</g;
    var AVGCD3percentLymphResult=module.exports.removeWhiteSpace(cd4Payload.AVGCD3percentLymph);
    var AVGCD3AbsCntResult=module.exports.removeWhiteSpace(cd4Payload.AVGCD3AbsCnt);
    var AVGCD3CD4percentLymphResult=module.exports.removeWhiteSpace(cd4Payload.AVGCD3CD4percentLymph);
    var AVGCD3CD4AbsCntResult=module.exports.removeWhiteSpace(cd4Payload.AVGCD3CD4AbsCnt);
    var CD45AbsCntResult=module.exports.removeWhiteSpace(cd4Payload.CD45AbsCnt);
    if(hasNumbersOnly.test(AVGCD3percentLymphResult)){
      validData.push(AVGCD3percentLymphResult);
    }
    if(hasNumbersOnly.test(AVGCD3AbsCntResult)){
      validData.push(AVGCD3AbsCntResult);
    }
    if(hasNumbersOnly.test(AVGCD3CD4percentLymphResult)){
      validData.push(AVGCD3CD4percentLymphResult);
    }
    if(hasNumbersOnly.test(AVGCD3CD4AbsCntResult)){
      validData.push(AVGCD3CD4AbsCntResult);
    }
    if(hasNumbersOnly.test(CD45AbsCntResult)){
      validData.push(CD45AbsCntResult);
    }
    if(validData.length>0){
      hasValidData=true;
    }
    return hasValidData;
  }
  function generateCd4ValidData(cd4Payload){
    var cd4Data={};
    var hasNumbersOnly = /^[0-9]*(?:\.\d{1,2})?$/;
    var hasLessThanSymbol=/</g;
    var AVGCD3percentLymphResult=module.exports.removeWhiteSpace(cd4Payload.AVGCD3percentLymph);
    var AVGCD3AbsCntResult=module.exports.removeWhiteSpace(cd4Payload.AVGCD3AbsCnt);
    var AVGCD3CD4percentLymphResult=module.exports.removeWhiteSpace(cd4Payload.AVGCD3CD4percentLymph);
    var AVGCD3CD4AbsCntResult=module.exports.removeWhiteSpace(cd4Payload.AVGCD3CD4AbsCnt);
    var CD45AbsCntResult=module.exports.removeWhiteSpace(cd4Payload.CD45AbsCnt);
    if(hasNumbersOnly.test(AVGCD3percentLymphResult)){
      cd4Data.AVGCD3percentLymph=cd4Payload.AVGCD3percentLymph;
    }
    if(hasNumbersOnly.test(AVGCD3AbsCntResult)){
      cd4Data.AVGCD3AbsCnt=cd4Payload.AVGCD3AbsCnt;
    }
    if(hasNumbersOnly.test(AVGCD3CD4percentLymphResult)){
      cd4Data.AVGCD3CD4percentLymph=cd4Payload.AVGCD3CD4percentLymph;
    }
    if(hasNumbersOnly.test(AVGCD3CD4AbsCntResult)){
      cd4Data.AVGCD3CD4AbsCnt=cd4Payload.AVGCD3CD4AbsCnt;
    }
    if(hasNumbersOnly.test(CD45AbsCntResult)){
      cd4Data.CD45AbsCnt=cd4Payload.CD45AbsCnt;
    }
    return cd4Data;
  }
  function generateCd4Exceptions(cd4Payload){
    var cd4Exceptions={};
    var hasNumbersOnly = /^[0-9]*(?:\.\d{1,2})?$/;
    var hasLessThanSymbol=/</g;
    var AVGCD3percentLymphResult=module.exports.removeWhiteSpace(cd4Payload.AVGCD3percentLymph);
    var AVGCD3AbsCntResult=module.exports.removeWhiteSpace(cd4Payload.AVGCD3AbsCnt);
    var AVGCD3CD4percentLymphResult=module.exports.removeWhiteSpace(cd4Payload.AVGCD3CD4percentLymph);
    var AVGCD3CD4AbsCntResult=module.exports.removeWhiteSpace(cd4Payload.AVGCD3CD4AbsCnt);
    var CD45AbsCntResult=module.exports.removeWhiteSpace(cd4Payload.CD45AbsCnt);
    if(!hasNumbersOnly.test(AVGCD3percentLymphResult)){
      cd4Exceptions.AVGCD3percentLymph=cd4Payload.AVGCD3percentLymph;
    }
    if(!hasNumbersOnly.test(AVGCD3AbsCntResult)){
      cd4Exceptions.AVGCD3AbsCnt=cd4Payload.AVGCD3AbsCnt;
    }
    if(!hasNumbersOnly.test(AVGCD3CD4percentLymphResult)){
      cd4Exceptions.AVGCD3CD4percentLymph=cd4Payload.AVGCD3CD4percentLymph;
    }
    if(!hasNumbersOnly.test(AVGCD3CD4AbsCntResult)){
      cd4Exceptions.AVGCD3CD4AbsCnt=cd4Payload.AVGCD3CD4AbsCnt;
    }
    if(!hasNumbersOnly.test(CD45AbsCntResult)){
      cd4Exceptions.CD45AbsCnt=cd4Payload.CD45AbsCnt;
    }
    return cd4Exceptions;
  }
  function convertViralLoadPayloadToRestConsumableObs(viralLoad,patientUuId){
    var date=moment(viralLoad.DateCollected).format();
    var body={
      person:patientUuId,
      obsDatetime:date,
      concept:"a8982474-1350-11df-a1f1-0026b9348838",
      value:viralLoad.FinalResult
    };
    return body;
  }
  function convertViralLoadPayloadToRestConsumableObs(viralLoad,patientUuId){
    var date=moment(viralLoad.DateCollected).format();
    var body={
      person:patientUuId,
      obsDatetime:date,
      concept:"a8982474-1350-11df-a1f1-0026b9348838",
      value:0
    };

    return body;
  }
  function convertViralLoadExceptionToRestConsumableObs(viralLoad,patientUuId){
    var date=moment(viralLoad.DateCollected).format();
    var body={
      person:patientUuId,
      obsDatetime:date,
      concept:"457c741d-8f71-4829-b59d-594e0a618892"
    };
    var labExceptions=module.exports.getLabExceptions();
      if(viralLoad.FinalResult.toUpperCase() in labExceptions){
        var labTestConcept="a8982474-1350-11df-a1f1-0026b9348838";
        var codedConceptValue=labExceptions[viralLoad.FinalResult.toUpperCase()];
        var codedPayload=module.exports.generateCodedPayload(patientUuId,labTestConcept,codedConceptValue,date);
        body.concept=codedPayload.concept;
        body.groupMembers=codedPayload.groupMembers;
      }
      else{
        var value=viralLoad.FinalResult;
        var labTestConcept="a8982474-1350-11df-a1f1-0026b9348838";
        var nonCodedPayload=module.exports.generateNonCodedPayload(patientUuId,labTestConcept,value,date);
        body.concept=nonCodedPayload.concept;
        body.groupMembers=nonCodedPayload.groupMembers
    }

    return body;
  }
  function convertCD4PayloadTORestConsumableObs(CD4payload,patientUuId){
    var date=moment(CD4payload.DateCollected).format();
    var body={
      concept:"a896cce6-1350-11df-a1f1-0026b9348838",
      person:patientUuId,
      obsDatetime:date,
      groupMembers:[]
      };
      if("AVGCD3percentLymph" in CD4payload){
        var conceptUuId="a89c4220-1350-11df-a1f1-0026b9348838";
        var value=CD4payload.AVGCD3percentLymph;
        var AVGCD3percentLymph=module.exports.generateCD4PanelSingleObject(patientUuId,conceptUuId,value,date);
        body.groupMembers.push(AVGCD3percentLymph);
      }
      if("AVGCD3AbsCnt" in CD4payload){
        var conceptUuId="a898fcd2-1350-11df-a1f1-0026b9348838";
        var value=CD4payload.AVGCD3AbsCnt;
        var AVGCD3AbsCnt=module.exports.generateCD4PanelSingleObject(patientUuId,conceptUuId,value,date);
        body.groupMembers.push(AVGCD3AbsCnt);
      }
      if("AVGCD3CD4percentLymph" in CD4payload){
        var conceptUuId="a8970a26-1350-11df-a1f1-0026b9348838";
        var value=CD4payload.AVGCD3CD4percentLymph;
        var AVGCD3CD4percentLymph=module.exports.generateCD4PanelSingleObject(patientUuId,conceptUuId,value,date);
        body.groupMembers.push(AVGCD3CD4percentLymph);
      }
      if("AVGCD3CD4AbsCnt" in CD4payload){
        var conceptUuId="a8a8bb18-1350-11df-a1f1-0026b9348838";
        var value=CD4payload.AVGCD3CD4AbsCnt;
        var AVGCD3CD4AbsCnt=module.exports.generateCD4PanelSingleObject(patientUuId,conceptUuId,value,date);
        body.groupMembers.push(AVGCD3CD4AbsCnt);
      }
      if("CD45AbsCnt" in CD4payload){
        var conceptUuId="a89c4914-1350-11df-a1f1-0026b9348838";
        var value=CD4payload.CD45AbsCnt;
        var CD45AbsCnt=module.exports.generateCD4PanelSingleObject(patientUuId,conceptUuId,value,date);
        body.groupMembers.push(CD45AbsCnt);
      }

    return body;
  }
  function convertCD4ExceptionTORestConsumableObs(CD4payload,patientUuId){
    var date=moment(CD4payload.DateCollected).format();
    var body={
      concept:"457c741d-8f71-4829-b59d-594e0a618892",
      person:patientUuId,
      obsDatetime:date,
      groupMembers:[]
      };
      var AVGCD3percentLymph=module.exports.cd4ExceptionGroupMemberGenerator(patientUuId,CD4payload,"AVGCD3percentLymph","a89c4220-1350-11df-a1f1-0026b9348838",date);
      if(AVGCD3percentLymph.length>0){
        _.each(AVGCD3percentLymph,function(groupMember){
          body.groupMembers.push(groupMember);
        });
      }
      var AVGCD3AbsCnt=module.exports.cd4ExceptionGroupMemberGenerator(patientUuId,CD4payload,"AVGCD3AbsCnt","a898fcd2-1350-11df-a1f1-0026b9348838",date);
      if(AVGCD3AbsCnt.length>0){
        _.each(AVGCD3AbsCnt,function(groupMember){
          body.groupMembers.push(groupMember);
        });
      }
      var AVGCD3CD4percentLymph=module.exports.cd4ExceptionGroupMemberGenerator(patientUuId,CD4payload,"AVGCD3CD4percentLymph","a8970a26-1350-11df-a1f1-0026b9348838",date);
      if(AVGCD3CD4percentLymph.length>0){
        _.each(AVGCD3CD4percentLymph,function(groupMember){
          body.groupMembers.push(groupMember);
        });
      }
      var AVGCD3CD4AbsCnt=module.exports.cd4ExceptionGroupMemberGenerator(patientUuId,CD4payload,"AVGCD3CD4AbsCnt","a8a8bb18-1350-11df-a1f1-0026b9348838",date);
      if(AVGCD3CD4AbsCnt.length>0){
        _.each(AVGCD3CD4AbsCnt,function(groupMember){
          body.groupMembers.push(groupMember);
        });
      }
      var CD45AbsCnt=module.exports.cd4ExceptionGroupMemberGenerator(patientUuId,CD4payload,"CD45AbsCnt","a89c4914-1350-11df-a1f1-0026b9348838",date);
      if(CD45AbsCnt.length>0){
        _.each(CD45AbsCnt,function(groupMember){
          body.groupMembers.push(groupMember);
        });
      }

    return body;
  }
  function cd4ExceptionGroupMemberGenerator(patientUuId,CD4payload,typeOfTest,labTestConcept,date){
    var groupMembers=[];
    var labExceptions=module.exports.getLabExceptions();
    if(typeOfTest in CD4payload){
      if(CD4payload[typeOfTest].toUpperCase() in labExceptions){
        var codedConceptValue=labExceptions[CD4payload[typeOfTest].toUpperCase()];
        var codedPayload=module.exports.generateCodedPayload(patientUuId,labTestConcept,codedConceptValue,date);
        _.each(codedPayload.groupMembers,function(groupMember){
          groupMembers.push(groupMember);
        });
      }
      else{
        var value=CD4payload[typeOfTest];
        var nonCodedPayload=module.exports.generateNonCodedPayload(patientUuId,labTestConcept,value,date);
        _.each(nonCodedPayload.groupMembers,function(groupMember){
          groupMembers.push(groupMember);
        });
    }
    }
    return groupMembers;
  }
  function convertDNAPCRPayloadTORestConsumableObs(DNAPCRPayload,patientUuId){
    var body={
      concept:"a898fe80-1350-11df-a1f1-0026b9348838",
      person:patientUuId
    };
    var date=moment(DNAPCRPayload.DateCollected).format();
      body.obsDatetime=date;
      if(DNAPCRPayload.FinalResult.toUpperCase()=="NEGATIVE"){
        body.value="a896d2cc-1350-11df-a1f1-0026b9348838";
      }
      else if(DNAPCRPayload.FinalResult.toUpperCase()=="POSITIVE"){
        body.value="a896f3a6-1350-11df-a1f1-0026b9348838";
      }
    return body;
  }
  function getLabExceptions(){
   return {
     "POOR SAMPLE QUALITY":"a89c3f1e-1350-11df-a1f1-0026b9348838",
     "NOT DONE":"a899ea48-1350-11df-a1f1-0026b9348838",
     "INDETERMINATE":"a89a7ae4-1350-11df-a1f1-0026b9348838",
     "BELOW DETECTABLE LIMIT":"a89c3f1e-1350-11df-a1f1-0026b9348838",
     "UNABLE TO COLLECT SAMPLE":"a8afcec6-1350-11df-a1f1-0026b9348838",
     "SPECIMEN NOT RECEIVED":"0271c15e-4f7f-4a18-9b45-2d7e5b6f7057",
     "ORDERED FOR WRONG PATIENT":"3366412a-e279-4428-a671-37221804c6e6"
   }
 }
 function generateCodedPayload(patientUuId,labTestConcept,codedConceptValue,date){
   var payload={
     concept:"457c741d-8f71-4829-b59d-594e0a618892",
     groupMembers:[
       {
         concept:"f67ff075-f91e-4b71-897a-9ded87b34984",
         person:patientUuId,
         value:labTestConcept,
         obsDatetime:date
       },
       {
         concept:"5026a3ee-0612-48bf-b9a3-a2944ddc3e04",
         person:patientUuId,
         value:codedConceptValue,
         obsDatetime:date
       }
   ]
 }
 return payload;
 }
 function generateNonCodedPayload(patientUuId,labTestConcept,value,date){
   var payload={
     concept:"457c741d-8f71-4829-b59d-594e0a618892",
     groupMembers:[
       {
         concept:"f67ff075-f91e-4b71-897a-9ded87b34984",
         person:patientUuId,
         value:labTestConcept,
         obsDatetime:date
       },
       {
         concept:"a8a06fc6-1350-11df-a1f1-0026b9348838",
         person:patientUuId,
         value:value,
         obsDatetime:date
       }

   ]
 }
 return payload;
 }
 function generateCD4PanelSingleObject(patientUuId,conceptUuId,value,date){
   var payload={
     concept:conceptUuId,
     person:patientUuId,
     value:value,
     obsDatetime:date
   }
   return payload;
 }
  function getPatientHivSummary(request, callback) {
      var uuid = request.params.uuid;
      var order = helpers.getSortOrder(request.query.order);
    var queryParts = {
      columns: request.query.fields || "*",
      table: "etl.flat_hiv_summary",
      where: ["uuid = ? and t1.is_clinical_encounter = 1", uuid],
      order: order || [{
        column: 'encounter_datetime',
        asc: false
      }],
      offset: request.query.startIndex,
      limit: request.query.limit
    };

    var qParts = {
      columns: "*",
      table: "amrs.encounter_type",
      where: ["retired = ?", 0],
      offset: request.query.startIndex,
      limit: 1000
    };

    var encounterTypeNames = {};
    //get encounter type Name
    var encounterNamesPromise = db.queryDb(qParts);
    var summaryDataPromise = db.queryDb(queryParts);

    var promise = Promise.all([encounterNamesPromise, summaryDataPromise])
    .then(function(data) {
      var encTypeNames = data[0];
      var summaryData = data[1];

      // Map encounter type ids to names.
      _.each(encTypeNames.result, function(row) {
        encounterTypeNames[row.encounter_type_id] = row.name;
      });

      // Format & Clean up raw summaries
      _.each(summaryData.result, function(summary) {
        summary.cur_arv_meds = helpers.getARVNames(summary.cur_arv_meds);
        summary.arv_first_regimen = helpers.getARVNames(summary.arv_first_regimen);
        summary['encounter_type_name'] = encounterTypeNames[summary.encounter_type];
        summary['prev_encounter_type_name'] = encounterTypeNames[summary.prev_encounter_type_hiv];
      });

      // Return when done.
      return summaryData;
    });

    if(_.isFunction(callback)) {
      promise.then(function(result) {
        callback(result);
      }).catch(function(err) {
        callback(err);
      });
    }

    return promise;
  }

  function getPatientVitals(request, callback) {
    var uuid = request.params.uuid;
    var order =  helpers.getSortOrder(request.query.order);
    // request.query.page;
    // request.query.pageSize;

    var queryParts = {
      columns: request.query.fields || "*",
      table: "etl.flat_vitals",
      where: ["uuid = ?", uuid],
      order: order || [{
        column: 'encounter_datetime',
        asc: false
      }],
      offset: request.query.startIndex,
      limit: request.query.limit
    };

    // Use promisified function instead
    var promise = db.queryDb(queryParts);

    if(_.isFunction(callback)) {
      promise.then(function(result) {
        callback(result);
      }).catch(function(err) {
        callback(err);
      });
    }

    // return the promise
    return promise;
  }

  function getClinicalNotes(request, callback) {
    var patientEncounters = encounterService.getPatientEncounters(request.params.uuid);
    var patientHivSummary = getPatientHivSummary(request);
    var patientVitals = getPatientVitals(request);


    Promise.all([patientEncounters, patientHivSummary, patientVitals]).then(function(data) {
        var encounters = data[0];
        var hivSummaries = data[1].result;
        var vitals = data[2].result;
        var notes = noteService.generateNotes(encounters,hivSummaries,vitals);
        callback({notes:notes,status:'notes generated'});
    })
    .catch (function(e) {
        // Return empty json on error
        console.log('Error',e);
        callback({notes:[],status:'error generating notes', error:e});
    });
  }

  function getPatientData(request, callback) {
    var uuid = request.params.uuid;
    var order =  helpers.getSortOrder(request.query.order);

    var queryParts = {
      columns: request.query.fields || "t1.*, t2.cur_arv_meds",
      table: "etl.flat_labs_and_imaging",
      joins: [
        ['etl.flat_hiv_summary', 't2', 't1.encounter_id = t2.encounter_id']
      ],
      where: ["t1.uuid = ?", uuid],
      order: order || [{
        column: 'test_datetime',
        asc: false
      }],
      offset: request.query.startIndex,
      limit: request.query.limit
    };

    db.queryServer_test(queryParts, function(result) {
      _.each(result.result, function(row) {
        row.tests_ordered = helpers.getTestsOrderedNames(row.tests_ordered);
        row.cur_arv_meds = helpers.getARVNames(row.cur_arv_meds);
      });
      callback(result);
    });
  }

  function getPatient(request, callback) {
    var uuid = request.params.uuid;
    var order =  helpers.getSortOrder(request.query.order);

    var queryParts = {
      columns: request.query.fields || "*",
      table: "etl.flat_hiv_summary",
      where: ["uuid = ?", uuid],
      order: order || [{
        column: 'encounter_datetime',
        asc: false
      }],
      offset: request.query.startIndex,
      limit: request.query.limit
    };

    db.queryServer_test(queryParts, function(result) {
      callback(result);
    });
  }

  function getPatientStgetPatientCountGroupedByLocationatics(request, callback) {
    var periodFrom = request.query.startDate || new Date().toISOString().substring(0, 10);
    var periodTo = request.query.endDate || new Date().toISOString().substring(0, 10);
    var order =  helpers.getSortOrder(request.query.order);

    var queryParts = {
      columns: "t3.location_id,t3.name,count( distinct t1.patient_id) as total",
      table: "amrs.patient",
      where: ["date_format(t1.date_created,'%Y-%m-%d') between date_format(?,'%Y-%m-%d') AND date_format(?,'%Y-%m-%d')", periodFrom, periodTo],
      group: ['t3.uuid,t3.name'],
      order: order || [{
        column: 't2.location_id',
        asc: false
      }],
      joins: [
        ['amrs.encounter', 't2', 't1.patient_id = t2.patient_id'],
        ['amrs.location', 't3', 't2.location_id=t3.location_id'],
        ['amrs.person_name', 't4', 't4.person_id=t1.patient_id']
      ],
      offset: request.query.startIndex,
      limit: request.query.limit
    };

    db.queryServer_test(queryParts, function(result) {
      callback(result);
    });
  }

  function getPatientDetailsGroupedByLocation(request, callback) {
    var location = request.params.location;
    var periodFrom = request.query.startDate || new Date().toISOString().substring(0, 10);
    var periodTo = request.query.endDate || new Date().toISOString().substring(0, 10);
    var order =  helpers.getSortOrder(request.query.order);
    var queryParts = {
      columns: "distinct t4.uuid as patientUuid, t1.patient_id, t3.given_name, t3.middle_name, t3.family_name",
      table: "amrs.patient",
      where: ["t2.location_id = ? AND date_format(t1.date_created,'%Y-%m-%d') between date_format(?,'%Y-%m-%d') AND date_format(?,'%Y-%m-%d')", location, periodFrom, periodTo],
      order: order || [{
        column: 't2.location_id',
        asc: false
      }],
      joins: [
        ['amrs.encounter', 't2', 't1.patient_id = t2.patient_id'],
        ['amrs.person_name', 't3', 't3.person_id=t1.patient_id'],
        ['amrs.person', 't4', 't4.person_id=t1.patient_id']
      ],
      offset: request.query.startIndex,
      limit: request.query.limit
    };

    db.queryServer_test(queryParts, function(result) {
      callback(result);
    });
  }

  function getPatientListByIndicator(request, callback) {
    var reportIndicator = request.query.indicator;
    var location = request.params.location;
    var startDate = request.query.startDate || new Date().toISOString().substring(0, 10);
    var endDate = request.query.endDate || new Date().toISOString().substring(0, 10);
    var order =  helpers.getSortOrder(request.query.order);
    var startAge =request.query.startAge||0;
    var endAge =request.query.endAge||150;
    var gender =(request.query.gender||'M,F').split(',');
    var reportName = request.query.reportName || 'hiv-summary-report';
    //Check for undefined query field
    if (reportIndicator === undefined)
      callback(Boom.badRequest('indicator (Report Indicator) is missing from your request query'));
    //declare query params
    var queryParams = {
      reportIndicator: reportIndicator,
      reportName: reportName
    };
    //build report
    reportFactory.buildPatientListExpression(queryParams, function(exprResult) {
      var queryParts = {
        columns: "t1.person_id,t1.encounter_id,t1.location_id,t1.location_uuid, t1.uuid as patient_uuid",
        concatColumns: "concat(t2.given_name,' ',t2.middle_name,' ',t2.family_name) as person_name; " +
          "group_concat(distinct t3.identifier separator ', ') as identifiers",
        table: exprResult.resource,
        where: ["t1.encounter_datetime >= ? and t1.encounter_datetime <= ? " +
         "and t1.location_uuid = ? and t1.is_clinical_encounter = 1 and " +
         "(t1.next_clinical_datetime_hiv is null or t1.next_clinical_datetime_hiv  >= ? )" +
         " and coalesce(t1.death_date, out_of_care) is null and round(datediff(t1.encounter_datetime,t4.birthdate)/365) >= ?" +
        " and round(datediff(t1.encounter_datetime,t4.birthdate)/365) <= ? and t4.gender in ?" +
          exprResult.whereClause, startDate, endDate, location, endDate, startAge, endAge, gender
        ],
        joins: [
          ['amrs.person_name', 't2', 't1.person_id = t2.person_id'],
          ['amrs.person', 't4', 't1.person_id = t4.person_id']
        ],
        leftOuterJoins: [
          ['amrs.patient_identifier', 't3', 't1.person_id = t3.patient_id']
        ],
        order: order || [{
          column: 'encounter_datetime',
          asc: false
        }],
        offset: request.query.startIndex,
        limit: request.query.limit,
        group: ['t1.person_id']
      };
      db.queryServer_test(queryParts, function(result) {
        callback(result);
      });
    });
  }

  function getPatientByIndicatorAndLocation(request, callback) {
    var reportIndicator = request.query.indicator;
    var startDate = request.query.startDate || new Date().toISOString().substring(0, 10);
    var endDate = request.query.endDate || new Date().toISOString().substring(0, 10);
    var order =  helpers.getSortOrder(request.query.order);
    var reportName = request.query.reportName || 'hiv-summary-monthly-report';
    var locationIds = request.query.locations;
    var startAge =request.query.startAge||0;
    var endAge =request.query.endAge||150;
    var gender =(request.query.gender||'M,F').split(',');
    var locations = [];
    _.each(locationIds.split(','), function(loc) {
      locations.push(Number(loc));
    });
    //Check for undefined query field
    if (reportIndicator === undefined)
      callback(Boom.badRequest('indicator (Report Indicator) is missing from your request query'));
    //declare query params
    var queryParams = {
      reportIndicator: reportIndicator,
      reportName: reportName
    };
    //build report
    reportFactory.buildPatientListExpression(queryParams, function(exprResult) {
      var queryParts = {
        columns: "t1.person_id,t1.encounter_id,t1.location_id,t1.location_uuid, t1.uuid as patient_uuid",
        concatColumns: "concat(t2.given_name,' ',t2.middle_name,' ',t2.family_name) as person_name; " +
          "group_concat(distinct t3.identifier separator ', ') as identifiers",
        table: 'etl.flat_hiv_summary',
        where: ["t1.encounter_datetime >= ? and t1.encounter_datetime <= ? " +
         "and t1.location_id in ? and t1.is_clinical_encounter = 1 and " +
         "(t1.next_clinical_datetime_hiv is null or t1.next_clinical_datetime_hiv  >= ?)" +
         " and coalesce(t1.death_date, out_of_care) is null and round(datediff(t1.encounter_datetime,t4.birthdate)/365) >= ?" +
        " and round(datediff(t1.encounter_datetime,t4.birthdate)/365) <= ? and t4.gender in ?" +
          exprResult.whereClause, startDate, endDate, locations, endDate, startAge, endAge, gender
        ],
        joins: [
          ['amrs.person_name', 't2', 't1.person_id = t2.person_id'],
          ['amrs.person', 't4', 't1.person_id = t4.person_id']
        ],
        leftOuterJoins: [
          ['amrs.patient_identifier', 't3', 't1.person_id = t3.patient_id']
        ],
        order: order || [{
          column: 'encounter_datetime',
          asc: false
        }],
        offset: request.query.startIndex,
        limit: request.query.limit,
        group: ['t1.person_id']
      };
      db.queryServer_test(queryParts, function(result) {
        callback(result);
      });
    });
  }
  function getSyncronizedPatientLabOrders(request,reply){
    var promise1=module.exports.getAllEIDTestResultsByPatientUuId(request.query.patientUuId);
    var promise2=module.exports.getPatientAllTestObsByPatientUuId(request.query.patientUuId);
    var mergedEidResults={};
  return new Promise(function(resolve,reject){
    promise1.then(function(response){
      mergedEidResults=eidObs.mergeEidResults(response);
      return promise2;
    })
    .then(function(obsResponse){
      var missingResult=eidObs.findAllMissingEidResults(mergedEidResults,obsResponse);
      return module.exports.postAllObsToAMRS(missingResult,request.query.patientUuId);
    })
    .then(function(response){
      return module.exports.getPatientAllTestObsByPatientUuId(request.query.patientUuId);
    })
    .then(function(updatedObs){
      reply({updatedObs});
    })
    .catch(function(error){
      reject(error);
    })
  });
  }
  return {
    getPatientHivSummary: getPatientHivSummary,
    getPatientVitals: getPatientVitals,
    getClinicalNotes: getClinicalNotes,
    getPatientData: getPatientData,
    getPatient: getPatient,
    getPatientCountGroupedByLocation: getPatientStgetPatientCountGroupedByLocationatics,
    getPatientDetailsGroupedByLocation: getPatientDetailsGroupedByLocation,
    getPatientListByIndicator: getPatientListByIndicator,
    getPatientByIndicatorAndLocation: getPatientByIndicatorAndLocation,
    getSyncronizedPatientLabOrders:getSyncronizedPatientLabOrders,
    getAllEIDTestResultsByPatientUuId:getAllEIDTestResultsByPatientUuId,
    getPatientIdentifiers:getPatientIdentifiers,
    getPatientAllTestObsByPatientUuId:getPatientAllTestObsByPatientUuId,
    getRestResource:getRestResource,
    getPatientTestObsByConceptUuId:getPatientTestObsByConceptUuId,
    postAllObsToAMRS:postAllObsToAMRS,
    convertViralLoadPayloadToRestConsumableObs:convertViralLoadPayloadToRestConsumableObs,
    convertCD4PayloadTORestConsumableObs:convertCD4PayloadTORestConsumableObs,
    convertDNAPCRPayloadTORestConsumableObs:convertDNAPCRPayloadTORestConsumableObs,
    convertViralLoadExceptionToRestConsumableObs:convertViralLoadExceptionToRestConsumableObs,
    convertCD4ExceptionTORestConsumableObs:convertCD4ExceptionTORestConsumableObs,
    generateCD4PanelSingleObject:generateCD4PanelSingleObject,
    getLabExceptions:getLabExceptions,
    cd4ExceptionGroupMemberGenerator:cd4ExceptionGroupMemberGenerator,
    generateNonCodedPayload:generateNonCodedPayload,
    generateCodedPayload:generateCodedPayload 
    }
}();
