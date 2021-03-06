/*jshint -W003, -W098, -W117, -W026 */
"use strict";
// var dao = require('./etl-dao');
var dao = require('./etl-dao');
var patientList = require('./dao/patient-list/patient-list-dao');
var preRequest = require('./pre-request-processing');
var pack = require('./package');
var winston = require('winston');
var path = require('path');
var _ = require('lodash');
var Joi = require('joi');
var eidLabData = require('./eid-data-synchronization/eid-lab-results');
var eidService = require('./service/eid.service');
var patientListCompare = require('./service/patient-list-compare.service.js');
var Boom = require('boom');
var authorizer = require('./authorization/etl-authorizer');
var config = require('./conf/config');
var privileges = authorizer.getAllPrivileges();
var etlHelpers = require('./etl-helpers.js');
var crypto = require('crypto');
var motd = require('./dao/motd_notification/motd_notification-dao');
var patientProgramService = require('./programs/patient-program-base.service.js');
import { MonthlyScheduleService } from './service/monthly-schedule-service';
import { PatientStatusChangeTrackerService } from './service/patient-status-change-tracker-service';
import { clinicalArtOverviewService } from './service/clinical-art-overview.service';
import { hivComparativeOverviewService } from './service/hiv-comparative-overview.service';
import { clinicalPatientCareStatusOverviewService } from './service/clinical-patient-care-status-overview';
import { SlackService } from './service/slack-service';
import { Moh731Service } from './service/moh-731/moh-731.service';
import { PatientRegisterReportService } from './service/patient-register-report.service';
import { HivSummaryIndicatorsService } from './service/hiv-summary-indicators.service';
import { PatientMonthlyStatusHistory } from './service/patient-monthly-status-history'
import { cohortUserService } from './service/cohort-user.service.js';
import { patientsRequiringVLService } from './service/patients-requiring-viral-load.service';
var patientReminderService = require('./service/patient-reminder.service.js');

module.exports = function () {

    var routes = [{
        method: 'GET',
        path: '/',
        config: {
            plugins: {
                'hapiAuthorization': false
            },
            handler: function (request, reply) {

                console.log('default rote', request.path);

                reply('Welcome to Ampath ETL service.');
                //return reply(Boom.forbidden('Not this end point bruh'));
            },
            description: 'Home',
            notes: 'Returns a message that shows ETL service is running.',
            tags: ['api'],
        }
    },
    {
        method: 'POST',
        path: '/etl/user-feedback',
        config: {
            plugins: {
                'hapiAuthorization': false
            },
            handler: function (request, reply) {
                let payload = request.payload;
                let message = `*From*  ${payload.name} \n *Location:*  ${payload.location} \n *Phone:*  ${payload.phone} \n *Message:* \n \`\`\`${payload.message}\`\`\``;
                let service = new SlackService();
                service.sendUserFeedBack(message).then((status) => {
                    reply(status);
                }).catch((error) => {
                    reply(Boom.badData(error));
                });
            },
            description: 'User feedback end point',
            notes: 'This receive user feedback sent from the client and sends it to slack',
            tags: ['api', 'feedback'],
        }
    },
    {
        method: 'GET',
        path: '/etl/get-monthly-schedule',
        config: {
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewClinicDashBoard
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                if (request.query.locationUuids) {

                    let reportParams = etlHelpers.getReportParams('name', ['startDate', 'endDate', 'locationUuids'], request.query);
                    let service = new MonthlyScheduleService();
                    service.getMonthlyScheduled(reportParams).then((result) => {
                        reply(result);
                    }).catch((error) => {
                        reply(error);
                    })

                }
            },
            description: 'Get monthly schedule',
            notes: 'Returns a list of appointments,visits and has not returned',
            tags: ['api'],
        }
    },
    {
        method: 'GET',
        path: '/etl/daily-appointments/{startDate}',
        config: {
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewClinicDashBoard
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                if (request.query.locationUuids) {
                    preRequest.resolveLocationIdsToLocationUuids(request,
                        function () {
                            request.query.groupBy = 'groupByPerson,groupByd';
                            let compineRequestParams = Object.assign({}, request.query, request.params);
                            let reportParams = etlHelpers.getReportParams('daily-appointments', ['startDate', 'locations', 'groupBy'], compineRequestParams);

                            dao.runReport(reportParams).then((result) => {
                                reply(result);
                            }).catch((error) => {
                                reply(error);
                            })
                        });
                }
            },
            description: 'Get daily appointments list',
            notes: 'Returns a list of patients with appointments',
            tags: ['api'],
        }
    },
    {
        method: 'GET',
        path: '/etl/daily-visits/{startDate}',
        config: {
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewClinicDashBoard
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                if (request.query.locationUuids) {
                    preRequest.resolveLocationIdsToLocationUuids(request,
                        function () {
                            request.query.groupBy = 'groupByPerson,groupByd';
                            let compineRequestParams = Object.assign({}, request.query, request.params);
                            let reportParams = etlHelpers.getReportParams('daily-attendance', ['startDate', 'locations', 'groupBy'], compineRequestParams);

                            dao.runReport(reportParams).then((result) => {
                                reply(result);
                            }).catch((error) => {
                                reply(error);
                            })
                        });
                }
            },
            description: 'Get daily attendance list',
            notes: 'Returns a facility daily attendance list',
            tags: ['api'],
        }
    },
    {
        method: 'GET',
        path: '/etl/daily-has-not-returned/{startDate}',
        config: {
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewClinicDashBoard
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                if (request.query.locationUuids) {
                    preRequest.resolveLocationIdsToLocationUuids(request,
                        function () {
                            request.query.groupBy = 'groupByPerson,groupByd';
                            let compineRequestParams = Object.assign({}, request.query, request.params);
                            let reportParams = etlHelpers.getReportParams('daily-has-not-returned', ['startDate', 'locations', 'groupBy'], compineRequestParams);
                            reportParams.limit = 100000;
                            dao.runReport(reportParams).then((result) => {
                                reply(result);
                            }).catch((error) => {
                                reply(error);
                            })
                        });
                }
            },
            description: 'Get a list of patients who did not attend a scheduled visit',
            notes: 'Returns a list of patients who did not attend their scheduled visits on the selected date',
            tags: ['api'],
        }
    },
    {
        method: 'GET',
        path: '/etl/clinic-lab-orders/{dateActivated}',
        config: {
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewClinicDashBoard
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                if (request.query.locationUuids) {
                    preRequest.resolveLocationIdsToLocationUuids(request,
                        function () {
                            request.query.groupBy = 'groupByPerson,groupByd';
                            let compineRequestParams = Object.assign({}, request.query, request.params);
                            let reportParams = etlHelpers.getReportParams('clinic-lab-orders-report', ['dateActivated', 'locations', 'groupBy'], compineRequestParams);

                            dao.runReport(reportParams).then((result) => {
                                _.each(result.result, (row) => {
                                    row.order_type = etlHelpers.getTestsOrderedNames(row.order_type);
                                });
                                reply(result);
                            }).catch((error) => {
                                reply(error);
                            })
                        });
                }
            },
            description: 'Get a list of patients who made lab orders on a selected date',
            notes: 'Returns a list of patients patients who made lab orders through selected clinics on a selected date',
            tags: ['api'],
        }
    },
    {
        method: 'GET',
        path: '/etl/defaulter-list',
        config: {
            auth: 'simple',
            handler: function (request, reply) {
                dao.getDefaulterList(request, reply);
            },
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewClinicDashBoard
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            description: "Get a location's defaulter list",
            notes: "Returns a location's defaulter list.",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                }
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/patient/{patientUuid}/hiv-clinical-reminder/{referenceDate}',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewPatient
                }
            },
            handler: function (request, reply) {
                let EIDLabReminderService = require('./service/eid/eid-lab-reminder.service');
                EIDLabReminderService.pendingEIDReminders(request.params, config.eid)
                    .then((eidReminders) => {
                        let compineRequestParams = Object.assign({}, request.query, request.params);
                        compineRequestParams.limit = 1;
                        let reportParams = etlHelpers.getReportParams('clinical-reminder-report', ['referenceDate', 'patientUuid', 'indicators'], compineRequestParams);

                        dao.runReport(reportParams).then((results) => {
                            try {
                                let processedResults = patientReminderService.generateReminders(results.result, eidReminders);
                                results.result = processedResults;
                                reply(results);
                            } catch (err) {
                                console.log('Error occurred while processing reminders', err)
                            }

                        }).catch((error) => {
                            reply(error);
                        });
                    }).catch((err) => {
                        console.log('EID lab results err', err);
                        reply(err);
                    });

            },
            description: 'Get a list of reminders for selected patient and indicators',
            notes: 'Returns a  list of reminders for selected patient and indicators on a given reference date',
            tags: ['api'],
        }
    },
    {
        method: 'POST',
        path: '/etl/forms/error',
        config: {
            auth: 'simple',
            handler: function (request, reply) {

                dao.logError(request, reply);
            }
        }
    },
    {
        method: 'POST',
        path: '/javascript-errors',
        config: {
            handler: function (request, reply) {
                if (request.payload) {
                    var logger = new winston.Logger({
                        transports: [
                            new winston.transports.File({
                                level: 'info',
                                filename: 'client-logs.log',
                                handleExceptions: true,
                                json: true,
                                colorize: false,
                            }),
                        ],
                        exitOnError: false,
                    });
                    logger.add(require('winston-daily-rotate-file'), {
                        filename: path.join(__dirname, 'logs', 'client-logs.log')
                    });
                    logger.info(request.payload);
                }

                reply({
                    message: 'ok'
                });
            }

        }
    }, {
        method: 'GET',
        path: '/etl/patient/{uuid}',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewPatient
                }
            },
            handler: function (request, reply) {
                dao.getPatient(request, reply);
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/patient-program/{patientUuid}',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewPatient
                }
            },
            handler: function (request, reply) {
                var requestParams = Object.assign({}, request.query, request.params);
                var patientUuid = requestParams.patientUuid;
                patientProgramService.getPatientPrograms(patientUuid)
                    .then((results) => {
                        reply(results);
                    }).catch((error) => {
                        reply(error);
                    });

            },
            description: 'Get a list of programs ',
            notes: 'Returns a  list of programs',
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {
                    patientUuid: Joi.string()
                        .required()
                        .description("The patient's uuid(universally unique identifier)."),
                }
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/patient-program/{patientUuid}/program/{programUuid}',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewPatient
                }
            },
            handler: function (request, reply) {
                var requestParams = Object.assign({}, request.query, request.params);
                var patientUuid = requestParams.patientUuid;
                var programUuid = requestParams.programUuid;
                patientProgramService.getPatientProgram(patientUuid, programUuid)
                    .then((results) => {
                        reply(results);
                    }).catch((error) => {
                        reply(error);
                    });

            },
            description: 'Get program config of a user',
            notes: 'Returns program config  of a user',
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {
                    patientUuid: Joi.string()
                        .required()
                        .description("The patient's uuid(universally unique identifier)."),
                    programUuid: Joi.string()
                        .required()
                        .description("program Uuid (universally unique identifier)."),
                }
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/patient/{uuid}/clinical-notes',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewPatient
                }
            },
            handler: function (request, reply) {
                dao.getClinicalNotes(request, reply);
            },
            description: 'Get patient clinical notes',
            notes: 'Returns a list of notes constructed from several ' +
            'patient information sources, particularly encounters',
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {
                    uuid: Joi.string()
                        .required()
                        .description("The patient's uuid(universally unique identifier)."),
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/patient/{uuid}/hiv-patient-clinical-summary',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    roles: [privileges.canViewPatient, privileges.canViewDataAnalytics]
                }
            },
            handler: function (request, reply) {
                dao.getHivPatientClinicalSummary(request, reply);
            }

        }
    }, {
        method: 'GET',
        path: '/etl/location/{id}/hiv-patient-clinical-summary',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    roles: [privileges.canViewPatient, privileges.canViewDataAnalytics]
                }
            },
            handler: function (request, reply) {
                dao.getHivPatientClinicalSummary(request, reply);
            }

        }
    }, {
        method: 'GET',
        path: '/etl/patient/{uuid}/vitals',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewPatient
                }
            },
            handler: function (request, reply) {
                dao.getPatientVitals(request, reply);
            },
            description: 'Get patient vitals',
            notes: "Returns a list of historical patient's vitals with the given patient uuid.",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {
                    uuid: Joi.string()
                        .required()
                        .description("The patient's uuid(universally unique identifier)."),
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/patient/{uuid}/data',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewPatient
                }
            },
            handler: function (request, reply) {
                dao.getPatientData(request, reply);
            },
            description: 'Get patient lab test data',
            notes: 'Returns a list of historical lab tests data of a patient with the given patient uuid.',
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {
                    uuid: Joi.string()
                        .required()
                        .description("The patient's uuid(universally unique identifier)."),
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/patient/{uuid}/hiv-summary',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewPatient
                }
            },
            handler: function (request, reply) {
                dao.getPatientHivSummary(request, reply);
            },
            description: 'Get patient HIV summary',
            notes: "Returns a list of historical patient's HIV summary with the given patient uuid. " +
            "A patient's HIV summary includes details such as last appointment date, " +
            "current ARV regimen etc. as at that encounter's date. ",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {
                    uuid: Joi.string()
                        .required()
                        .description("The patient's uuid(universally unique identifier)."),
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/location/{uuid}/clinic-encounter-data',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewClinicDashBoard
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'params', //can be in either query or params so you have to specify
                        name: 'uuid' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                dao.getClinicEncounterData(request, reply);
            }
        }
    }, {
        method: 'GET',
        path: '/etl/location/{uuid}/monthly-appointment-visits',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewClinicDashBoard
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'params', //can be in either query or params so you have to specify
                        name: 'uuid' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                dao.getClinicMonthlySummary(request, reply);
            },
            description: "Get a location's monthly appointment visits",
            notes: "Returns a location's monthly appointment visits with the given location uuid.",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {
                    uuid: Joi.string()
                        .required()
                        .description("The location's uuid(universally unique identifier)."),
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/location/{uuid}/hiv-summary-indicators',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewDataAnalytics
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'params', //can be in either query or params so you have to specify
                        name: 'uuid' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                dao.getClinicHivSummayIndicators(request, reply);
            },
            description: "Get a location's HIV summary indicators",
            notes: "Returns a location's HIV summary indicators.",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {
                    uuid: Joi.string()
                        .required()
                        .description("The location's uuid(universally unique identifier)."),
                }
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/clinical-hiv-comparative-overview',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewDataAnalytics
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                request.query.reportName = 'clinical-hiv-comparative-overview-report';
                if (!authorizer.hasReportAccess(request.query.reportName)) {
                    return reply(Boom.forbidden('Unauthorized'));
                }
                preRequest.resolveLocationIdsToLocationUuids(request,
                    function () {
                        let compineRequestParams = Object.assign({}, request.query, request.params);
                        let reportParams = etlHelpers.getReportParams('clinical-hiv-comparative-overview-report',
                            ['startDate', 'endDate', 'indicator', 'locationUuids', 'locations', 'order', 'gender'], compineRequestParams);

                        let service = new hivComparativeOverviewService();
                        service.getAggregateReport(reportParams).then((result) => {
                            reply(result);
                        }).catch((error) => {
                            reply(error);
                        });
                    });
            },
            description: "Get the clinical hiv comparative overview summary",
            notes: "Returns a comparative summary of various indicator eg enrollement, on_art,and vl suppression",
            tags: ['api'],
            validate: {
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/clinical-hiv-comparative-overview/patient-list',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewPatient
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                request.query.reportName = 'clinical-hiv-comparative-overview-report';
                preRequest.resolveLocationIdsToLocationUuids(request,
                    function () {
                        let requestParams = Object.assign({}, request.query, request.params);
                        let service = new hivComparativeOverviewService();
                        service.getPatientListReport(requestParams).then((result) => {
                            reply(result);
                        }).catch((error) => {
                            reply(error);
                        });
                    });
            },
            description: "Get the clinical hiv comparative overview patient",
            notes: "Returns the patient list for various indicators in the clinical hiv comparative summary",
            tags: ['api'],
            validate: {
                query: {
                    indicator: Joi.string()
                        .required()
                        .description("A list of comma separated indicators"),
                    locationUuids: Joi.string()
                        .optional()
                        .description("A list of comma separated location uuids"),
                    reportName: Joi.string()
                        .optional()
                        .description("the name of the report you want patient list"),
                    startDate: Joi.string()
                        .optional()
                        .description("The start date to filter by"),
                    endDate: Joi.string()
                        .optional()
                        .description("The end date to filter by"),
                    startIndex: Joi.number()
                        .required()
                        .description("The startIndex to control pagination"),
                    limit: Joi.number()
                        .required()
                        .description("The offset to control pagination")
                }
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/clinical-patient-care-status-overview',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewDataAnalytics
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                request.query.reportName = 'clinical-patient-care-status-overview-report';
                let compineRequestParams = Object.assign({}, request.query, request.params);
                let reportParams = etlHelpers.getReportParams('clinical-patient-care-status-overview-report',
                    ['startDate', 'endDate', 'indicator', 'locationUuids', 'order', 'gender'], compineRequestParams);

                let service = new clinicalPatientCareStatusOverviewService();
                service.getAggregateReport(reportParams).then((result) => {
                    reply(result);
                }).catch((error) => {
                    reply(error);
                });
            },
            description: "Get the clinical patint care status patient list",
            notes: "Returns a comparative summary of all patient status indicators eg on_art,out_of_care,in_care,transferred_out.....",
            tags: ['api'],
            validate: {
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/clinical-patient-care-status-overview/patient-list',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewPatient
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {

                request.query.reportName = 'clinical-patient-care-status-overview-report';
                let requestParams = Object.assign({}, request.query, request.params);
                let service = new PatientStatusChangeTrackerService();
                service.getPatientListReport(requestParams).then((result) => {
                    reply(result);
                }).catch((error) => {
                    reply(error);
                });
            },
            description: "Get the clinical-patient-care-status-overview patient list",
            notes: "Returns the patient list for various indicators in the clinical-patient-care-status-overview",
            tags: ['api'],
            validate: {
                query: {
                    indicator: Joi.string()
                        .required()
                        .description("A list of comma separated indicators"),
                    locationUuids: Joi.string()
                        .optional()
                        .description("A list of comma separated location uuids"),
                    startDate: Joi.string()
                        .required()
                        .description("The start date to filter by"),
                    endDate: Joi.string()
                        .required()
                        .description("The end date to filter by"),
                    startIndex: Joi.number()
                        .required()
                        .description("The startIndex to control pagination"),
                    limit: Joi.number()
                        .required()
                        .description("The offset to control pagination"),
                    analysis: Joi.string()
                        .optional()
                        .description("analysis type"),
                }
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/clinical-art-overview',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewDataAnalytics
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {

                request.query.reportName = 'clinical-art-overview-report';
                let compineRequestParams = Object.assign({}, request.query, request.params);
                let reportParams = etlHelpers.getReportParams('clinical-art-overview-report',
                    ['startDate', 'endDate', 'indicator', 'locationUuids', 'order', 'gender'], compineRequestParams);

                let service = new clinicalArtOverviewService();
                service.getAggregateReport(reportParams).then((result) => {
                    reply(result);
                }).catch((error) => {
                    reply(error);
                });
            },
            description: "Get the clinical art  overview summary",
            notes: "Returns the a comparative summary of art drugs used by patients",
            tags: ['api'],
            validate: {
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/clinical-art-overview/patient-list',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewPatient
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {

                request.query.reportName = 'clinical-art-overview-report';
                let requestParams = Object.assign({}, request.query, request.params);
                let service = new clinicalArtOverviewService();
                service.getPatientListReport(requestParams).then((result) => {
                    reply(result);
                }).catch((error) => {
                    reply(error);
                });
            },
            description: "Get the  clinical art overview patient list",
            notes: "Returns the patient list for clinical-art-overview report",
            tags: ['api'],
            validate: {
                query: {
                    indicator: Joi.string()
                        .required()
                        .description("A list of comma separated indicators"),
                    locationUuids: Joi.string()
                        .optional()
                        .description("A list of comma separated location uuids"),
                    reportName: Joi.string()
                        .optional()
                        .description("the name of the report you want patient list"),
                    startDate: Joi.string()
                        .required()
                        .description("The start date to filter by"),
                    endDate: Joi.string()
                        .required()
                        .description("The end date to filter by"),
                    startIndex: Joi.number()
                        .required()
                        .description("The startIndex to control pagination"),
                    limit: Joi.number()
                        .required()
                        .description("The offset to control pagination")

                }
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/location/{uuid}/appointment-schedule',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewClinicDashBoard
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'params', //can be in either query or params so you have to specify
                        name: 'uuid' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                dao.getClinicAppointmentSchedule(request, reply);
            },
            description: "Get a location's appointment schedule",
            notes: "Returns a location's appointment-schedule with the given location uuid.",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {
                    uuid: Joi.string()
                        .required()
                        .description("The location's uuid(universally unique identifier)."),
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/patient-flow-data',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewClinicDashBoard
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                preRequest.resolveLocationIdsToLocationUuids(request,
                    function () {
                        dao.getPatientFlowData(request, reply);
                    });
            },
            description: "Get a location's patient movement and waiting time data",
            notes: "Returns a location's patient flow with the given location uuid.",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {}
            }
        }
    }, {
        method: 'GET',
        path: '/etl/clinic-lab-orders-data',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewClinicDashBoard
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                preRequest.resolveLocationIdsToLocationUuids(request,
                    function () {
                        dao.getClinicLabOrdersData(request, reply);
                    });
            },
            description: "Get a location's lab orders data",
            notes: "Returns a location's lab orders data with the given location uuid.",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {}
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/patient/{patient_uuid}/monthly-care-status',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewPatient
                }
            },
            handler: function (request, reply) {
                let history = new PatientMonthlyStatusHistory();
                history.getPatientMonthlyStatusHistory(request.params.patient_uuid, request.query.startDate, request.query.endDate).then((result) => {
                    reply(result);
                });
            },
            description: "Get the the care status of patient on a monthly basis",
            notes: "Returns a list showing care status of a patient at the end of every month in a given period",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {}
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/patient/{patient_uuid}/daily-care-status',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewPatient
                }
            },
            handler: function (request, reply) {
                let requestParams = Object.assign({}, request.query, request.params);
                let reportParams = etlHelpers.getReportParams('patient-daily-care-status',
                    ['referenceDate', 'patient_uuid'],
                    requestParams);
                dao.runReport(reportParams).then((result) => {
                    reply(result);
                }).catch((error) => {
                    reply(error);
                });
            },
            description: "Get the the care status of patient on a given date",
            notes: "Returns the care status of a patient on a given day",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {}
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/location/{uuid}/daily-visits',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewClinicDashBoard
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'params', //can be in either query or params so you have to specify
                        name: 'uuid' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                dao.getClinicDailyVisits(request, reply);
            },
            description: "Get a location's daily visits",
            notes: "Returns a location's daily visits with the given parameter uuid.",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {
                    uuid: Joi.string()
                        .required()
                        .description("The location's uuid(universally unique identifier)."),
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/location/{uuid}/has-not-returned',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewClinicDashBoard
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'params', //can be in either query or params so you have to specify
                        name: 'uuid' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                dao.getHasNotReturned(request, reply);
            },
            description: "Get a location's not returned visits",
            notes: "Returns a location's not returned visits with the given parameter uuid.",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {
                    uuid: Joi.string()
                        .required()
                        .description("The location's uuid(universally unique identifier)."),
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/location/{uuid}/monthly-appointment-schedule',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewClinicDashBoard
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'params', //can be in either query or params so you have to specify
                        name: 'uuid' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                dao.getClinicMonthlyAppointmentSchedule(request, reply);
            },
            description: "Get a location's monthly appointment schedule",
            notes: "Returns a location's monthly appointment schedule.",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {
                    uuid: Joi.string()
                        .required()
                        .description("The location's uuid(universally unique identifier)."),
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/location/{uuid}/monthly-visits',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewClinicDashBoard
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'params', //can be in either query or params so you have to specify
                        name: 'uuid' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                dao.getClinicMonthlyVisits(request, reply);
            },
            description: "Get a location's monthly visits",
            notes: "Returns the actual number of patient visits for each day in a given month and location.",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {
                    uuid: Joi.string()
                        .required()
                        .description("The location's uuid(universally unique identifier)."),
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/location/{uuid}/defaulter-list',
        config: {
            auth: 'simple',
            handler: function (request, reply) {
                dao.getClinicDefaulterList(request, reply);
            },
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewClinicDashBoard
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'params', //can be in either query or params so you have to specify
                        name: 'uuid' //name of the location parameter
                    }]
                }
            },
            description: "Get a location's defaulter list",
            notes: "Returns a location's defaulter list.",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {
                    uuid: Joi.string()
                        .required()
                        .description("The location's uuid(universally unique identifier)."),
                }
            }
        }
    }, {
        method: 'OPTIONS',
        path: '/{param*}',
        handler: function (request, reply) {
            // echo request headers back to caller (allow any requested)
            var additionalHeaders = [];
            if (request.headers['access-control-request-headers']) {
                additionalHeaders = request.headers['access-control-request-headers'].split(', ');
            }
            var headers = _.union('Authorization, Content-Type, If-None-Match'.split(', '), additionalHeaders);

            reply().type('text/plain')
                .header('Access-Control-Allow-Headers', headers.join(', '));
        }
    }, {
        method: 'GET',
        path: '/etl/custom_data/{userParams*3}',
        config: {
            auth: 'simple',
            handler: function (request, reply) {
                dao.getCustomData(request, reply);
            }
            /*
             the rest request and query expression should be
             /table/filter_column/filter/filter_value or
             /table/filter_column/filter/filter_value?fields=(field1,field2,fieldn) or

             */
        }
    }, {
        method: 'GET',
        path: '/etl/patient/creation/statistics',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    roles: [privileges.canViewDataEntryStats, privileges.canViewPatient]
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                dao.getPatientCountGroupedByLocation(request, reply);
            },
            description: "Get patients created by period",
            notes: "Returns a list of patients created within a specified time period in all locations.",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                query: {
                    startDate: Joi.string()
                        .optional()
                        .description("The start date to filter by"),
                    endDate: Joi.string()
                        .optional()
                        .description("The end date to filter by"),
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/location/{location}/patient/creation/statistics',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    roles: [privileges.canViewDataEntryStats, privileges.canViewPatient]
                }
            },
            handler: function (request, reply) {
                dao.getPatientDetailsGroupedByLocation(request, reply);
            },
            description: "Get details of patient created in a location",
            notes: "Returns details of patient created in a location",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {
                    location: Joi.string()
                        .required()
                        .description("The location's uuid(universally unique identifier)."),
                }
            }
        }
    }, {
        /**
         endpoint  to  get  Reports
         @todo Rename  to get-report-by-name,count by{patient/encounters},filter-params{location/starting date/ end date}
         @todo ,groupby params{location/monthly}
         **/

        method: 'GET',
        path: '/etl/get-report-by-report-name',
        config: {
            auth: 'simple',
            plugins: {
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }],
                    exemptedParameter: [ //set this if you want to prevent validation checks for certain reports
                        {
                            type: 'query', //can be in either query or params so you have to specify
                            name: 'report', //name of the parameter
                            value: 'clinical-reminder-report' //parameter value
                        }, {
                            type: 'query', //can be in either query or params so you have to specify
                            name: 'report', //name of the parameter
                            value: 'patient-register-report' //parameter value
                        }, {
                            type: 'query', //can be in either query or params so you have to specify
                            name: 'report', //name of the parameter
                            value: 'medical-history-report' //parameter value
                        }
                    ],
                    aggregateReport: [ //set this if you want to  validation checks for certain aggregate reports
                        {
                            type: 'query', //can be in either query or params so you have to specify
                            name: 'report', //name of the parameter
                            value: 'hiv-summary-report' //parameter value
                        }, {
                            type: 'query', //can be in either query or params so you have to specify
                            name: 'report', //name of the parameter
                            value: 'hiv-summary-monthly-report' //parameter value
                        }, {
                            type: 'query', //can be in either query or params so you have to specify
                            name: 'report', //name of the parameter
                            value: 'MOH-731-report' //parameter value
                        }, {
                            type: 'query', //can be in either query or params so you have to specify
                            name: 'report', //name of the parameter
                            value: 'MOH-731-allsites-report' //parameter value
                        }, {
                            type: 'query', //can be in either query or params so you have to specify
                            name: 'report', //name of the parameter
                            value: 'clinic-comparator-report' //parameter value
                        }, {
                            type: 'query', //can be in either query or params so you have to specify
                            name: 'report', //name of the parameter
                            value: 'clinical-hiv-comparative-overview-report' //parameter value
                        }, {
                            type: 'query', //can be in either query or params so you have to specify
                            name: 'report', //name of the parameter
                            value: 'clinical-art-overview-report' //parameter value
                        }, {
                            type: 'query', //can be in either query or params so you have to specify
                            name: 'report', //name of the parameter
                            value: 'clinical-patient-care-status-overview-report' //parameter value
                        },

                    ]
                }
            },
            handler: function (request, reply) {
                //security check
                if (!authorizer.hasReportAccess(request.query.report)) {
                    return reply(Boom.forbidden('Unauthorized'));
                }
                preRequest.resolveLocationIdsToLocationUuids(request,
                    function () {
                        let requestParams = Object.assign({}, request.query, request.params);
                        let reportParams = etlHelpers.getReportParams(request.query.report,
                            ['startDate', 'endDate', 'indicator', 'locationUuids', 'locations', 'referenceDate',
                                'patientUuid', 'startAge', 'endAge', 'age', 'order', 'gender'],
                            requestParams);

                        dao.runReport(reportParams).then((result) => {
                            reply(result);
                        }).catch((error) => {
                            reply(error);
                        });
                    });
            },
            description: 'Get report ',
            notes: "General api endpoint that returns a report by passing " +
            "the report name parameter and a list of custom parameters " +
            "depending on the report e.g start date, end date for MOH-731 report.",
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                query: {
                    report: Joi.string()
                        .required()
                        .description("The name of the report to get indicators")
                }
            }

        }
    },
    {
        method: 'GET',
        path: '/etl/MOH-731-report',
        config: {
            auth: 'simple',
            plugins: {
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }],
                    aggregateReport: [ //set this if you want to  validation checks for certain aggregate reports
                        {
                            type: 'query', //can be in either query or params so you have to specify
                            name: 'reportName', //name of the parameter
                            value: 'MOH-731-report' //parameter value
                        }, {
                            type: 'query', //can be in either query or params so you have to specify
                            name: 'reportName', //name of the parameter
                            value: 'MOH-731-report-2017' //parameter value
                        }
                    ]
                }
            },
            handler: function (request, reply) {
                //security check
                if (!authorizer.hasReportAccess(request.query.reportName)) {
                    return reply(Boom.forbidden('Unauthorized'));
                }
                preRequest.resolveLocationIdsToLocationUuids(request,
                    function () {
                        let requestParams = Object.assign({}, request.query, request.params);
                        let reportParams = etlHelpers.getReportParams(request.query.reportName,
                            ['startDate', 'endDate', 'locationUuids', 'locations', 'isAggregated'], requestParams);

                        let service = new Moh731Service();
                        service.getAggregateReport(reportParams).then((result) => {
                            reply(result);
                        }).catch((error) => {
                            reply(error);
                        });
                    });
            },
            description: "Get the MOH 731 report",
            notes: "Api endpoint that returns MOH 731 report. It includes both MOH versions (legacy and 2017).",
            tags: ['api'],
            validate: {
                query: {
                    locationUuids: Joi.string()
                        .optional()
                        .description("A list of comma separated location uuids"),
                    reportName: Joi.string()
                        .required()
                        .description("the name of the report you want patient list"),
                    startDate: Joi.string()
                        .required()
                        .description("The start date to filter by"),
                    endDate: Joi.string()
                        .required()
                        .description("The end date to filter by"),
                    isAggregated: Joi.boolean()
                        .optional()
                        .description("Boolean checking if report is aggregated"),

                }
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/MOH-731-report/patient-list',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewPatient
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                preRequest.resolveLocationIdsToLocationUuids(request,
                    function () {
                        let requestParams = Object.assign({}, request.query, request.params);
                        let service = new Moh731Service();
                        service.getPatientListReport(requestParams).then((result) => {
                            reply(result);
                        }).catch((error) => {
                            reply(error);
                        });
                    });
            },
            description: "Get the MOH 731 patient list",
            notes: "Returns the patient list for MOH 731",
            tags: ['api'],
            validate: {
                query: {
                    indicator: Joi.string()
                        .required()
                        .description("A list of comma separated indicators"),
                    locationUuids: Joi.string()
                        .optional()
                        .description("A list of comma separated location uuids"),
                    reportName: Joi.string()
                        .required()
                        .description("the name of the report you want patient list"),
                    startDate: Joi.string()
                        .required()
                        .description("The start date to filter by"),
                    endDate: Joi.string()
                        .required()
                        .description("The end date to filter by"),
                    startIndex: Joi.number()
                        .required()
                        .description("The startIndex to control pagination"),
                    limit: Joi.number()
                        .required()
                        .description("The offset to control pagination")

                }
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/patient-status-change-tracking',
        config: {
            auth: 'simple',
            plugins: {
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }],
                    aggregateReport: [ //set this if you want to  validation checks for certain aggregate reports
                        {
                            type: 'query', //can be in either query or params so you have to specify
                            name: 'reportName', //name of the parameter
                            value: 'patient-status-change-tracker-report' //parameter value
                        }
                    ]
                }
            },
            handler: function (request, reply) {
                request.query.reportName = 'patient-status-change-tracker-report';
                //security check
                if (!authorizer.hasReportAccess(request.query.reportName)) {
                    return reply(Boom.forbidden('Unauthorized'));
                }
                if (request.query.locationUuids) {
                    preRequest.resolveLocationIdsToLocationUuids(request,
                        function () {
                            let requestParams = Object.assign({}, request.query, request.params);
                            let reportParams = etlHelpers.getReportParams(request.query.reportName,
                                ['startDate', 'endDate', 'locationUuids', 'locations', 'analysis'], requestParams);

                            let service = new PatientStatusChangeTrackerService();
                            service.getAggregateReport(reportParams).then((result) => {
                                reply(result);
                            }).catch((error) => {
                                reply(error);
                            });
                        });
                }
            },
            description: "Get the Patient Status report",
            notes: "Api endpoint that returns Patient Status Change Tracker Report",
            tags: ['api'],
            validate: {
                query: {
                    locationUuids: Joi.string()
                        .optional()
                        .description("A list of comma separated location uuids"),
                    startDate: Joi.string()
                        .required()
                        .description("The start date to filter by"),
                    endDate: Joi.string()
                        .required()
                        .description("The end date to filter by"),
                    analysis: Joi.string()
                        .optional()
                        .description("analysis type report")
                }
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/patient-status-change-tracking/patient-list',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewPatient
                },
            },
            handler: function (request, reply) {
                request.query.reportName = 'patient-status-change-tracker-report';
                if (request.query.locationUuids) {
                    preRequest.resolveLocationIdsToLocationUuids(request,
                        function () {
                            let requestParams = Object.assign({}, request.query, request.params);
                            let service = new PatientStatusChangeTrackerService();
                            service.getPatientListReport(requestParams).then((result) => {
                                reply(result);
                            }).catch((error) => {
                                reply(error);
                            });
                        });
                }
            },
            description: "Get Patient Status report patient list",
            notes: "Returns the patient list for Patient Status report",
            tags: ['api'],
            validate: {
                query: {
                    indicator: Joi.string()
                        .required()
                        .description("A list of comma separated indicators"),
                    locationUuids: Joi.string()
                        .optional()
                        .description("A list of comma separated location uuids"),
                    startDate: Joi.string()
                        .required()
                        .description("The start date to filter by"),
                    endDate: Joi.string()
                        .required()
                        .description("The end date to filter by"),
                    analysis: Joi.string()
                        .optional()
                        .description("analysis type report"),
                    startIndex: Joi.number()
                        .required()
                        .description("The startIndex to control pagination"),
                    limit: Joi.number()
                        .required()
                        .description("The offset to control pagination")

                }
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/user-cohorts',
        config: {
            auth: 'simple',
            plugins: {},
            handler: function (request, reply) {
                request.query.reportName = 'cohort-report';
                //security check
                if (!authorizer.hasReportAccess(request.query.reportName)) {
                    return reply(Boom.forbidden('Unauthorized'));
                }
                request.params.limit = 1000;
                let requestParams = Object.assign({}, request.query, request.params);
                let reportParams = etlHelpers.getReportParams('cohort-report',
                    ['userUuid'], requestParams);

                let service = new cohortUserService();
                service.getAggregateReport(reportParams).then((result) => {
                    reply(result);
                }).catch((error) => {
                    reply(error);
                });
            },
            description: "Get cohort(s) based on user uuid",
            notes: "Api endpoint that returns cohort(s) based on the user uuid",
            tags: ['api'],
        }
    },
    {
        method: 'GET',
        path: '/etl/cohort-user/{cohortUserId}',
        config: {
            auth: 'simple',
            plugins: {},
            handler: function (request, reply) {
                patientList.getCohortUser(request.params['cohortUserId'])
                    .then(function (cohortUser) {
                        if (cohortUser === null) {
                            reply(Boom.notFound('Resource does not exist'));
                        } else {
                            reply(cohortUser);
                        }
                    })
                    .catch(function (error) {
                        reply(Boom.create(500, 'Internal server error.', error));
                    });
            },
            description: "Get cohort users for a certain cohort",
            notes: "Api endpoint that returns cohort users based on the cohort uuid",
            tags: ['api'],
        }
    },
    {
        method: 'DELETE',
        path: '/etl/cohort-user/{cohortUserId}',
        config: {
            auth: 'simple',
            plugins: {},
            handler: function (request, reply) {
                patientList.voidCohortUser(request.params['cohortUserId'])
                    .then(function (message) {
                        reply(message);
                    })
                    .catch(function (error) {
                        reply(Boom.create(500, 'Internal server error.', error));
                    });
            },
            description: "Get cohort users for a certain cohort",
            notes: "Api endpoint that returns cohort users based on the cohort uuid",
            tags: ['api'],
        }
    },
    {
        method: 'POST',
        path: '/etl/cohort-user/{cohortUserId}',
        config: {
            auth: 'simple',
            plugins: {},
            handler: function (request, reply) {
                patientList.updateCohortUser(request.params['cohortUserId'], request.payload)
                    .then(function (updatedCohortUser) {
                        reply(updatedCohortUser);
                    })
                    .catch(function (error) {
                        if (error && error.isValid === false) {
                            reply(Boom.badRequest('Validation errors:' + JSON.stringify(error)));
                        } else {
                            reply(Boom.create(500, 'Internal server error.', error));
                        }
                    });
            },
            description: "Get cohort users for a certain cohort",
            notes: "Api endpoint that returns cohort users based on the cohort uuid",
            tags: ['api'],
        }
    },
    {
        method: 'POST',
        path: '/etl/cohort-user',
        config: {
            auth: 'simple',
            plugins: {},
            handler: function (request, reply) {
                patientList.createCohortUser(request.payload)
                    .then(function (newCohortUser) {
                        reply(newCohortUser);
                    })
                    .catch(function (error) {
                        if (error && error.isValid === false) {
                            reply(Boom.badRequest('Validation errors:' + JSON.stringify(error)));
                        } else {
                            console.error(error);
                            reply(Boom.create(500, 'Internal server error.', error));
                        }
                    });
            },
            description: "Get cohort users for a certain cohort",
            notes: "Api endpoint that returns cohort users based on the cohort uuid",
            tags: ['api'],
        }
    },
    {
        method: 'GET',
        path: '/etl/cohort/{cohortUuid}/cohort-users',
        config: {
            auth: 'simple',
            plugins: {},
            handler: function (request, reply) {
                patientList.getCohortUsersByCohortUuid(request.params['cohortUuid'])
                    .then(function (cohortUsers) {
                        reply(cohortUsers);
                    })
                    .catch(function (error) {
                        reply(Boom.create(500, 'Internal server error.', error));
                    });
            },
            description: "Get cohort users for a certain cohort",
            notes: "Api endpoint that returns cohort users based on the cohort uuid",
            tags: ['api'],
        }
    },
    {
        method: 'GET',
        path: '/etl/patient-register-report',
        config: {
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewClinicDashBoard
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'params', //can be in either query or params so you have to specify
                        name: 'uuid' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {
                if (request.query.locationUuids) {
                    preRequest.resolveLocationIdsToLocationUuids(request,
                        function () {
                            let requestParams = Object.assign({}, request.query, request.params);
                            let reportParams = etlHelpers.getReportParams(request.query.reportName,
                                ['startDate', 'endDate', 'indicators', 'locationUuids', 'groupBy',
                                    'limit', 'startAge', 'endAge', 'order', 'gender', 'countBy'], requestParams);

                            let service = new PatientRegisterReportService();
                            service.getAggregateReport(reportParams).then((result) => {
                                reply(result);
                            }).catch((error) => {
                                reply(error);
                            });
                        });
                }
            },
            description: "Get the Patient Register report",
            notes: "Api endpoint that returns Patient Register report.",
            tags: ['api'],
        }
    },
    {
        method: 'GET',
        path: '/etl/hiv-summary-indicators',
        config: {
            auth: 'simple',
            plugins: {
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }],
                    aggregateReport: [ //set this if you want to  validation checks for certain aggregate reports
                        {
                            type: 'query', //can be in either query or params so you have to specify
                            name: 'reportName', //name of the parameter
                            value: 'hiv-summary-report' //parameter value
                        }
                    ]
                }
            },
            handler: function (request, reply) {
                //security check
                request.query.reportName = 'hiv-summary-report';
                if (!authorizer.hasReportAccess(request.query.reportName)) {
                    return reply(Boom.forbidden('Unauthorized'));
                }
                preRequest.resolveLocationIdsToLocationUuids(request,
                    function () {
                        let requestParams = Object.assign({}, request.query, request.params);
                        let reportParams = etlHelpers.getReportParams('hiv-summary-report',
                            ['startDate', 'endDate', 'locationUuids', 'indicators', 'gender', 'startAge', 'endAge'], requestParams);

                        let service = new HivSummaryIndicatorsService();
                        service.getAggregateReport(reportParams).then((result) => {
                            reply(result);
                        }).catch((error) => {
                            reply(error);
                        });
                    });
            },
            description: "Get hiv summary indicators for selected clinic",
            notes: "Returns hiv summary indicators for the selected clinic(s),start date, end date",
            tags: ['api'],
            validate: {
                query: {
                    indicators: Joi.string()
                        .required()
                        .description("A list of comma separated indicators"),
                    locationUuids: Joi.string()
                        .required()
                        .description("A list of comma separated location uuids"),
                    startDate: Joi.string()
                        .required()
                        .description("The start date to filter by"),
                    endDate: Joi.string()
                        .required()
                        .description("The end date to filter by"),
                    gender: Joi.string()
                        .optional()
                        .description("The gender to filter by"),
                    startAge: Joi.string()
                        .optional()
                        .description("The start age to filter by"),
                    endAge: Joi.string()
                        .optional()
                        .description("The end age to filter by")

                }
            }
        }
    },
    {
        method: 'GET',
        path: '/etl/hiv-summary-indicators/patient-list',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewPatient
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {

                request.query.reportName = 'hiv-summary-report';
                let requestParams = Object.assign({}, request.query, request.params);
                let service = new HivSummaryIndicatorsService();
                service.getPatientListReport(requestParams).then((result) => {
                    reply(result);
                }).catch((error) => {
                    reply(error);
                });
            },
            description: "Get hiv summary indicator's patient list for selected clinic",
            notes: "Returns hiv summary indicator's patient list for the selected clinic,start date, end date",
            tags: ['api'],
            validate: {
                query: {
                    indicator: Joi.string()
                        .required()
                        .description("A list of comma separated indicators"),
                    locationUuids: Joi.string()
                        .required()
                        .description("A list of comma separated location uuids"),
                    startDate: Joi.string()
                        .required()
                        .description("The start date to filter by"),
                    endDate: Joi.string()
                        .required()
                        .description("The end date to filter by"),
                    startIndex: Joi.number()
                        .required()
                        .description("The startIndex to control pagination"),
                    limit: Joi.number()
                        .required()
                        .description("The offset to control pagination"),
                    startAge: Joi.string()
                        .optional()
                        .description("The start age to filter by"),
                    endAge: Joi.string()
                        .optional()
                        .description("The end age to filter by"),
                    gender: Joi.string()
                        .optional()
                        .description("The gender to filter by"),
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/location/{locationUuids}/patient-by-indicator',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    roles: [privileges.canViewPatient, privileges.canViewDataAnalytics]
                }
            },
            handler: function (request, reply) {
                request.query.reportName = 'hiv-summary-report';
                preRequest.resolveLocationIdsToLocationUuids(request,
                    function () {
                        dao.getPatientListReport(Object.assign({}, request.query, request.params))
                            .then((result) => {
                                reply(result);
                            }).catch((error) => {
                                reply(Boom.badRequest(error.toString()));
                            });
                    });
            },
            description: 'Get patient list by indicator',
            notes: 'Returns a patient list by indicator for a given location.',
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                params: {
                    locationUuids: Joi.string()
                        .required()
                        .description("The location's uuid(universally unique identifier).")
                },
                query: {
                    indicator: Joi.string()
                        .required()
                        .description("A list of comma separated indicators")
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/patient-by-indicator',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    roles: [privileges.canViewPatient, privileges.canViewDataAnalytics]
                }
            },
            handler: function (request, reply) {
                request.query.reportName = 'hiv-summary-monthly-report';
                preRequest.resolveLocationIdsToLocationUuids(request,
                    function () {
                        dao.getPatientListReport(Object.assign({}, request.query, request.params))
                            .then((result) => {
                                reply(result);
                            }).catch((error) => {
                                reply(Boom.badRequest(error.toString()));
                            });
                    });
            },
            description: 'Get patient',
            notes: 'Returns a patient by passing a given indicator and location.',
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                query: {
                    indicator: Joi.string()
                        .required()
                        .description("A list of comma separated indicators"),
                    locationUuids: Joi.string()
                        .required()
                        .description("A list of comma separated location uuids")
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/data-entry-statistics/{sub}',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewDataEntryStats
                },
                'openmrsLocationAuthorizer': {
                    locationParameter: [{
                        type: 'query', //can be in either query or params so you have to specify
                        name: 'locationUuids' //name of the location parameter
                    }]
                }
            },
            handler: function (request, reply) {

                if (request.params.sub === 'patientList' &&
                    !authorizer.hasPrivilege(privileges.canViewPatient)) {
                    return reply(Boom.forbidden('Unauthorized'));
                }

                var asyncRequests = 0; //this should be the number of async requests needed before they are triggered

                var onResolvedPromise = function (promise) {
                    asyncRequests--;
                    if (asyncRequests <= 0) { //voting process to ensure all pre-processing of request async operations are complete
                        dao.getDataEntryIndicators(request.params.sub, request, reply);
                    }
                };

                //establish the number of asyncRequests
                //this is done prior to avoid any race conditions
                if (request.query.formUuids) {
                    asyncRequests++;
                }
                if (request.query.encounterTypeUuids) {
                    asyncRequests++;
                }
                if (request.query.locationUuids) {
                    asyncRequests++;
                }

                if (asyncRequests === 0)
                    dao.getDataEntryIndicators(request.params.sub, request, reply);

                if (request.query.formUuids) {
                    dao.getIdsByUuidAsyc('amrs.form', 'form_id', 'uuid', request.query.formUuids,
                        function (results) {
                            request.query.formIds = results;
                        }).onResolved = onResolvedPromise;
                }
                if (request.query.encounterTypeUuids) {

                    dao.getIdsByUuidAsyc('amrs.encounter_type', 'encounter_type_id', 'uuid', request.query.encounterTypeUuids,
                        function (results) {
                            request.query.encounterTypeIds = results;
                        }).onResolved = onResolvedPromise;
                }
                if (request.query.locationUuids) {
                    dao.getIdsByUuidAsyc('amrs.location', 'location_id', 'uuid', request.query.locationUuids,
                        function (results) {
                            request.query.locationIds = results;
                        }).onResolved = onResolvedPromise;
                }
            }
        }
    }, {
        /**
         endpoint  to  get  Reports Indicators
         @todo Rename  to get-report-indicators by  report  name
         **/

        method: 'GET',
        path: '/etl/indicators-schema',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewDataAnalytics
                }
            },
            handler: function (request, reply) {
                //security check
                if (!authorizer.hasReportAccess(request.query.report)) {
                    return reply(Boom.forbidden('Unauthorized'));
                }

                dao.getIndicatorsSchema(request, reply);
            },
            description: 'Get HIV monthly summary indicator schema',
            notes: 'Returns HIV monthly summary indicator schema. ',
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                query: {
                    report: Joi.string()
                        .required()
                        .description("The name of the report to get indicators")
                }
            }
        }
    }, {


        method: 'GET',
        path: '/etl/indicators-schema-with-sections',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewDataAnalytics
                }
            },
            handler: function (request, reply) {
                dao.getIndicatorsSchemaWithSections(request, reply);
            }

        }
    }, {
        method: 'GET',
        path: '/etl/hiv-summary-data',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    roles: [privileges.canViewPatient, privileges.canViewDataAnalytics]
                }
            },
            handler: function (request, reply) {
                dao.getHivSummaryData(request, reply);
            }

        }
    }, {
        method: 'POST',
        path: '/etl/compare-patient-lists',
        config: {
            auth: 'simple',
            handler: function (request, reply) {
                var r = request;
                var handler;
                _.each(routes, function (route) {
                    if (route.path === request.payload.path) {
                        handler = route.config.handler;
                    }
                });

                var requestObject = {
                    query: request.payload.query,
                    params: request.payload.params
                };

                if (handler) {
                    patientListCompare.fetchAndCompareList(request.payload.patientList,
                        requestObject, handler)
                        .then(function (comparison) {
                            if (request.query.includeBoth === true || request.query.includeBoth === 'true') {
                                reply(comparison);
                            } else {
                                delete comparison.both;
                                reply(comparison);
                            }
                        })
                        .catch(function (error) {
                            reply(Boom.badImplementation('An internal error occured'));
                        })
                } else {
                    reply(Boom.badRequest('Unknown patient list etl path'));
                }

            }
        }
    },
    {
        method: 'GET',
        path: '/etl/patient-list-by-indicator',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    roles: [privileges.canViewPatient, privileges.canViewDataAnalytics]
                }
            },
            handler: function (request, reply) {
                preRequest.resolveLocationIdsToLocationUuids(request,
                    function () {
                        dao.getPatientListReport(Object.assign({}, request.query, request.params))
                            .then((result) => {
                                reply(result);
                            }).catch((error) => {
                                reply(Boom.badRequest(JSON.stringify(error)));
                            });
                    });
            },
            description: 'Get patient list',
            notes: 'Returns a patient by passing a given indicator, report and location.',
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                query: {
                    indicator: Joi.string()
                        .required()
                        .description("A list of comma separated indicators"),
                    locationUuids: Joi.string()
                        .required()
                        .description("A list of comma separated location uuids"),
                    reportName: Joi.string()
                        .required()
                        .description("the name of the report you want patient list"),
                    startIndex: Joi.number()
                        .required()
                        .description("The startIndex to control pagination"),
                    limit: Joi.number()
                        .required()
                        .description("The offset to control pagination")
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/patient-lab-orders',
        config: {
            auth: 'simple',
            handler: function (request, reply) {
                if (config.eidSyncOn === true)
                    eidLabData.getPatientLabResults(request, reply);
                else
                    reply(Boom.notImplemented('Sorry, sync service temporarily unavailable.'));
            }
        }
    }, {
        method: 'POST',
        path: '/etl/eid/order/{lab}',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': {
                    role: privileges.canViewPatient
                }
            },
            handler: function (request, reply) {
                dao.postLabOrderToEid(request, reply);
            }
        }
    }, {
        method: 'GET',
        path: '/etl/session/invalidate',
        config: {
            auth: 'simple',
            handler: function (request, reply) {
                dao.invalidateUserSession(request, reply);
            }
        }
    }, {
        method: 'GET',
        path: '/etl/lab-cohorts',
        config: {
            auth: false,
            plugins: {
                'hapiAuthorization': false
            },
            handler: function (request, reply) {

                var eidSyncApiKey = config.eidSyncApiKey;
                var headers = request.headers;

                var h_eidSyncApiKey = request.headers.eidsyncapikey;

                if (eidSyncApiKey === h_eidSyncApiKey) {
                    dao.loadLabCohorts(request, reply);
                } else {
                    reply(Boom.unauthorized('invalid api key'))
                }
            },
            description: 'Home',
            notes: 'Returns a message that shows ETL service is running.',
            tags: ['api'],
            validate: {
                options: {
                    allowUnknown: true
                },
                query: {
                    startDate: Joi.string()
                        .required()
                        .description("The start date to filter by"),
                    endDate: Joi.string()
                        .required()
                        .description("The end date to filter by"),
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/lab-cohorts-sync',
        config: {
            auth: false,
            plugins: {
                'hapiAuthorization': false
            },
            handler: function (request, reply) {

                var eidSyncApiKey = config.eidSyncApiKey;
                var headers = request.headers;

                var h_eidSyncApiKey = request.headers.eidsyncapikey;

                if (eidSyncApiKey === h_eidSyncApiKey) {
                    dao.syncLabCohorts(request, reply);
                } else {
                    reply(Boom.unauthorized('invalid api key'));
                }
            },
            description: 'Home',
            notes: 'Returns a message that shows ETL service is running.',
            tags: ['api']
        }
    }, {
        method: 'GET',
        path: '/etl/eid/load-order-justifications',
        config: {
            auth: 'simple',
            handler: function (request, reply) {

                dao.loadOrderJustifications(request, reply);
            },
            description: 'Justifications',
            notes: 'Returns order justification(s)',
            tags: ['api']
        }
    }, {
        method: 'POST',
        path: '/etl/fileupload',
        config: {
            auth: 'simple',
            handler: function (request, reply) {
                var replyPayload = {};
                var image = etlHelpers.decodeBase64Image(request.payload.data);
                var imageTypeRegularExpression = /\/(.*?)$/;
                var imageTypeDetected = image
                    .type
                    .match(imageTypeRegularExpression);
                var seed = crypto.randomBytes(20);
                var uniqueSHA1String = crypto
                    .createHash('sha1')
                    .update(seed)
                    .digest('hex');
                var userUploadedImagePath = config.etl.uploadsDirectory +
                    uniqueSHA1String +
                    '.' +
                    imageTypeDetected[1];
                try {
                    require('fs').writeFile(userUploadedImagePath, image.data,
                        function () {
                            replyPayload = {
                                image: uniqueSHA1String +
                                '.' +
                                imageTypeDetected[1]
                            };
                            reply(replyPayload);
                            console.log('DEBUG - feed:message: Saved to disk image attached by user:', userUploadedImagePath);
                        });
                } catch (error) {
                    console.log('ERROR:', error);
                    replyPayload = {
                        error: 'Error Uploading image'
                    };
                    reply(replyPayload);
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/files/{param*}',
        config: {
            auth: 'simple',
            handler: {
                directory: {
                    path: config.etl.uploadsDirectory,
                    redirectToSlash: true,
                    index: true
                }
            }
        }
    }, {
        method: 'GET',
        path: '/etl/eid/patients-with-results',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': false
            },
            handler: function (request, reply) {
                if (request.query.startDate && request.query.endDate) {
                    eidService.getPatientIdentifiersFromEIDResults(request.query.startDate,
                        request.query.endDate)
                        .then(function (response) {
                            reply(response);
                        })
                        .catch(function (error) {
                            reply(Boom.badImplementation('A server error occured'))
                        });
                } else {
                    reply(Boom.badRequest('startDate and endDate required'));
                }

            }
        }
    }, {
        method: 'GET',
        path: '/etl/motdNotifications',
        config: {
            auth: 'simple',
            plugins: {
                'hapiAuthorization': false
            },
            handler: function (request, reply) {
            motd.getMotdNotifications().then(function (motdNotifications) {

                         if (motdNotifications === null) {
                             reply(Boom.notFound('Resource does not exist'));
                         } else {
                             reply(motdNotifications);
                         }
                    })
                     .catch(function (error) {
                       reply(Boom.create(500, 'Internal server error.', error));
                    });

            },
            description: 'Daily Message Alerts',
            notes: 'Returns Messages to be shown to users on login'
        }
    },  {
            method: 'GET',
            path: '/etl/patients-requiring-viral-load-order',
            config: {
                auth: 'simple',
                plugins: {
                    'hapiAuthorization': {
                        role: privileges.canViewPatient
                    },
                    'openmrsLocationAuthorizer': {
                        locationParameter: [{
                            type: 'query', //can be in either query or params so you have to specify
                            name: 'locationUuids' //name of the location parameter
                        }]
                    }
                },
                handler: function (request, reply) {
                    request.query.indicator = 'needs_vl_in_period';
                    request.query.reportName = 'labs-report';
                    preRequest.resolveLocationIdsToLocationUuids(request,
                        function () {
                            let requestParams = Object.assign({}, request.query, request.params);
                            let service = new patientsRequiringVLService();
                            service.getPatientListReport(requestParams).then((result) => {
                                reply(result);
                            }).catch((error) => {
                                reply(error);
                            });
                        });
                },
                description: "Gets patients Requiring VL list", //patientsRequiringVLService
                notes: "Returns the patient list for various indicators in the labs report",
                tags: ['api'],
                validate: {
                    query: {
                        locationUuids: Joi.string()
                            .optional()
                            .description("A list of comma separated location uuids"),
                        startDate: Joi.string()
                            .optional()
                            .description("The start date to filter by"),
                        endDate: Joi.string()
                            .optional()
                            .description("The end date to filter by"),
                        startIndex: Joi.number()
                            .required()
                            .description("The startIndex to control pagination"),
                        limit: Joi.number()
                            .required()
                            .description("The offset to control pagination")
                    }
                }
            }
        }
    ];

    return routes;
}();
