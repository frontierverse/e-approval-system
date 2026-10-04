/** Mobile contracts deliberately separate basic and explicitly audited data. */
export type YouthPermissions = {
  canViewYouthBasic: true;
  canViewYouthDetails: boolean;
  canViewYouthContacts: boolean;
  canDownloadYouthDocuments: boolean;
  canManageYouth: boolean;
  canDeleteYouth: false;
};
export type YouthBasic = { id: string; name: string; admissionDate: string | null; dischargeDate: string | null; updatedAt: string };
export type YouthBasicDetail = { today: string; permissions: YouthPermissions; youth: YouthBasic };
export type YouthList = { today: string; permissions: YouthPermissions; items: YouthBasic[]; q: string; page: number; pageSize: 20; total: number; totalPages: number };
export type YouthExtension = { id: string; extensionOrder: number; previousDischargeDate: string; extendedDischargeDate: string; reason: string; processedAt: string; processedBy: { id: string; name: string } };
export type YouthSensitiveDetails = { birthDate: string | null; age: number | null; koreanAge: number | null; initialDischargeDate: string | null; dischargeExtensions: YouthExtension[] };
export type YouthFamilyContact = { id: string; relationship: string | null; phone: string | null };
export type YouthContacts = { phone: string | null; familyContacts: YouthFamilyContact[] };
export type YouthViewBase = { ok: true; replayed: boolean; today: string; youthId: string; permissions: YouthPermissions; sourceUpdatedAt: string; auditedAt: string; serverNow: string; disclosureUntil: string };
export type YouthDetailsView = YouthViewBase & { details: YouthSensitiveDetails };
export type YouthContactsView = YouthViewBase & { contacts: YouthContacts };
export type YouthDocument = { id: string; name: string; size: number; createdAt: string; updatedAt: string };
export type YouthDocuments = { today: string; youthId: string; permissions: YouthPermissions; documents: YouthDocument[] };
export type YouthOperation = 'profile.create' | 'profile.patch' | 'profile.extend' | 'personal.create' | 'personal.update' | 'personal.delete' | 'common.batch' | 'concept.create' | 'concept.delete' | 'concept.check' | 'rule.create' | 'rule.delete' | 'document.attach' | 'document.delete';
export type YouthMutation<T = YouthBasicDetail> = {
  ok: true; replayed: boolean; requestId: string; operation: YouthOperation;
  outcome: 'present' | 'deleted' | 'unavailable'; targetType: string; targetId: string; youthId: string | null;
  committedAt: string; committedUpdatedAt: string | null; result: T | null;
};
export type YouthHistoryChange = { field: string; label: string; from: string | null; to: string | null };
export type YouthHistoryItem = { id: string; createdAt: string; action: string; actor: { id: string; name: string } | null; changes: YouthHistoryChange[] };
export type YouthHistory = { today: string; permissions: YouthPermissions; youthId: string | null; items: YouthHistoryItem[]; page: number; pageSize: 5 | 10; total: number; totalPages: number };
export type YouthProfileDraft = { name: string; admissionDate: string; dischargeDate: string; birthDate: string; phone: string; familyContacts: { relationship: string; phone: string }[] };
export type YouthProfilePatch = { name?: string; admissionDate?: string | null; birthDate?: string | null; phone?: string | null; familyContacts?: { relationship: string | null; phone: string | null }[] };

export type YouthCommonSchedule={id:string;weekday:number;startHour:number;startMinute:number;endHour:number;endMinute:number;content:string;updatedAt:string};
export type YouthPersonalSchedule={id:string;youthId:string;content:string;scheduleType:'GENERAL'|'HOSPITAL';hospitalName:string|null;escortType:'STAFF'|'OTHER'|null;escortUserId:string|null;escortName:string|null;nextAppointmentDate:string|null;startMinute:number;endMinute:number;selectionMode:'DATES'|'WEEKDAYS';occurrenceDates:string[];recurrenceWeekdays:number[];recurrenceStartDate:string|null;recurrenceEndDate:string|null;updatedAt:string};
export type YouthPersonalList=YouthBasicDetail&{month:string;date:string;schedules:YouthPersonalSchedule[];staffOptions:{id:string;name:string}[]};
export type YouthPersonalDetail=YouthBasicDetail&{schedule:YouthPersonalSchedule;staffOptions:{id:string;name:string}[]};
export type YouthCommonList={today:string;permissions:YouthPermissions;weekday:number;items:YouthCommonSchedule[]};
export type YouthCurriculum={id:string;label:string;units:{id:string;label:string;subunits:{id:string;label:string}[]}[]}[];
export type YouthConcept={id:string;subject:'math';subunitId:string;content:string;updatedAt:string};
export type YouthConceptList={today:string;permissions:YouthPermissions;subject:'math';subunitId:string;curriculum:YouthCurriculum;concepts:YouthConcept[]};
export type YouthLearning=YouthBasicDetail&{subject:'math';subunitId:string;curriculum:YouthCurriculum;concepts:{id:string;content:string;updatedAt:string;checked:boolean;checkedAt:string|null}[];youthUpdatedAt:string};
export type YouthRule={id:string;category:string;detail:string;targetYouthId:string|null;targetYouthName:string|null;createdAt:string;updatedAt:string};
export type YouthRules={today:string;permissions:YouthPermissions;target:string;category:string;rules:YouthRule[];page:number;pageSize:10;total:number;totalPages:number};
export type YouthActivityHistory={today:string;permissions:YouthPermissions;page:number;pageSize:10;total:number;totalPages:number;logs:{id:string;createdAt:string;actorName:string;changeType:string|null;message:string|null;changes:{field:string;label:string;before:string|null;after:string|null}[]}[]};
