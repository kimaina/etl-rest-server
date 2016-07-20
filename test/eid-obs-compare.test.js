var chai = require('chai');
var request = require('request');
var sinon = require('sinon'); //for creating spies, mocks and stubs
var sinonChai = require('sinon-chai'); //expection engine for sinion
var labDataSamples = require('./mock/lab-data-samples');
//var nock = require('nock');
//var _ = require('underscore');
//var Hapi = require('hapi');
//var fakeServer = require('../sinon-server-1.17.3');
var eidObsCompare = require('../eid-obs-compare');

chai.config.includeStack = true;
global.expect = chai.expect;
global.should = chai.should;
global.Assertion = chai.Assertion;
global.assert = chai.assert;

var baseUrl = 'http://localhost:8002';
chai.use(sinonChai);

describe('EID-OBS COMPARE TESTS', function () {

    beforeEach(function (done) {

        done();
    });

    afterEach(function () {

    });

    it('should load eid-obs-compare module',
        function () {
            expect(eidObsCompare).to.be.defined;
            //expect(userSample).to.be.defined;
        });

    it('should load lab data samples module',
        function () {
            expect(labDataSamples).to.be.defined;
            //expect(userSample).to.be.defined;
        });

    it('should match eid and amrs viral load correctly when isViralLoadEquivalent',
        function () {
            var eidResult = labDataSamples.getEidViralLoad();
            var equivalentObs = labDataSamples.getAmrsViralLoadObs();

            var isEquivalent = eidObsCompare.isViralLoadEquivalent(eidResult, equivalentObs);

            expect(isEquivalent).to.be.true;
        });

    it('should match eid and amrs DNA PCR correctly when isDnaPcrEquivalent',
        function () {
            var eidResult = labDataSamples.getEidDnaPcr();
            var equivalentObs = labDataSamples.getAmrsEidPcrObs();

            var isEquivalent = eidObsCompare.isDnaPcrEquivalent(eidResult, equivalentObs);

            expect(isEquivalent).to.be.true;
        });


    it('should match eid and amrs CD4 Panel correctly when isDnaPcrEquivalent',
        function () {
            var eidResult = labDataSamples.getEidCd4Panel();
            var equivalentObs = labDataSamples.getAmrsCd4PanelObs();

            var isEquivalent = eidObsCompare.isCd4PanelEquivalent(eidResult, equivalentObs);

            expect(isEquivalent).to.be.true;
        });

    it('should locate a given eid result in an array of obs correctly when findEquivalentObject',
        function () {
            var arrayOfObs = [
                {
                    concept: { uuid: 'concept1' },
                    obsDateTime: '2014-01-01'
                },
                {
                    concept: { uuid: 'concept2' },
                    obsDateTime: '2013-06-02'
                },
                {
                    concept: { uuid: 'concept3' },
                    obsDatetime: '2014-01-04'
                },
                {
                    concept: { uuid: 'concept4' },
                    obsDatetime: '2014-01-04'
                }
            ];

            var eidResult = {
                DateCollected: '2014-01-04'
            };

            var foundObs =
                eidObsCompare.findEquivalentObject(eidResult, arrayOfObs,
                    function (eid, obs) {
                        return eidObsCompare.conceptDateComparer(eid, obs, 'concept3');
                    });

            expect(foundObs).to.deep.equal(arrayOfObs[2]);
        });

    it('should return all missing EID results when findMissingEidResult',
        function () {
            var arrayOfObs = [
                {
                    concept: { uuid: 'concept1' },
                    obsDateTime: '2014-01-01'
                },
                {
                    concept: { uuid: 'concept2' },
                    obsDateTime: '2013-06-02'
                },
                {
                    concept: { uuid: 'concept3' },
                    obsDatetime: '2014-01-04'
                },
                {
                    concept: { uuid: 'concept4' },
                    obsDatetime: '2014-01-04'
                },
                {
                    concept: { uuid: 'concept3' },
                    obsDatetime: '2016-03-04'
                }
            ];

            var eidResults = [
                {
                    DateCollected: '2014-01-04'
                },
                {
                    DateCollected: '2011-01-04'
                },
                {
                    DateCollected: '2010-01-04'
                },
                {
                    DateCollected: '2016-03-04'
                },
                {
                    DateCollected: '2014-01-23'
                },
            ];

            var foundObs =
                eidObsCompare.findMissingEidResults(eidResults, arrayOfObs,
                    function (eid, obs) {
                        return eidObsCompare.conceptDateComparer(eid, obs, 'concept3');
                    });
            expect(foundObs.length).to.equal(3);
            expect(foundObs[0]).to.deep.equal(eidResults[1]);
            expect(foundObs[1]).to.deep.equal(eidResults[2]);
            expect(foundObs[2]).to.deep.equal(eidResults[4]);
        });

    it('should call correct functions to/and find all eid results when ' +
        'findAllMissingEidResults',
        function () {
            var eidResults = {
                viralLoad: [{ DateCollected: '2016-03-04' }],
                pcr: [{ DateCollected: '2015-03-04' }],
                cd4Panel: [{ DateCollected: '2014-03-04' }]
            };
            var spy = sinon.spy(eidObsCompare, 'findMissingEidResults');
            var results = eidObsCompare.findAllMissingEidResults(eidResults, []);

            console.log('results', results);
            expect(spy.calledThrice).to.be.true; //proof that all three tests are compared

            //proof that checked for viral load
            expect(spy.firstCall.calledWith(eidResults.viralLoad, [], eidObsCompare.isViralLoadEquivalent)).to.be.true;

            //proof that checked for pcr
            expect(spy.secondCall.calledWith(eidResults.pcr, [], eidObsCompare.isDnaPcrEquivalent)).to.be.true;

            //proof that checked for cd4Panel
            expect(spy.thirdCall.calledWith(eidResults.cd4Panel, [], eidObsCompare.isCd4PanelEquivalent)).to.be.true;

            //results are as expected
            expect(eidResults).to.deep.equal(results); //since we are passing empty obs, then all results are missing
        });

    it('should merge EID results when mergeEidResults',
        function () {
            var eidResults = [
                {
                    patientIdentifier: 'id1',
                    viralLoad: ['val 1', 'val 2'],
                    pcr: ['val 1', 'val 2', 'val 3'],
                    cd4Panel: ['val 1', 'val 2', 'val 3']
                },
                {
                    patientIdentifier: 'id2',
                    viralLoad: ['val 3', 'val 4'],
                    pcr: ['val 4', 'val 5', 'val 6'],
                    cd4Panel: ['val 4', 'val 5', 'val 6']
                }
            ];

            var expectedMergedResults = {
                viralLoad: ['val 1', 'val 2', 'val 3', 'val 4'],
                pcr: ['val 1', 'val 2', 'val 3', 'val 4', 'val 5', 'val 6'],
                cd4Panel: ['val 1', 'val 2', 'val 3', 'val 4', 'val 5', 'val 6']
            };

            var mergedResult = eidObsCompare.mergeEidResults(eidResults);

            expect(mergedResult).to.deep.equal(expectedMergedResults);
        });



});