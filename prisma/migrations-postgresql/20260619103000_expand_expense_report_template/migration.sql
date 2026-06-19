UPDATE "DocumentTemplate"
SET
  "description" = '구매 요청, 사후 정산, 지급 요청을 함께 처리하는 양식',
  "schema" = $schema$
{
  "version": 1,
  "fields": [
    {
      "name": "title",
      "label": "제목",
      "type": "text",
      "required": true
    },
    {
      "name": "expenseType",
      "label": "지출구분",
      "type": "select",
      "required": true,
      "defaultValue": "post_settlement",
      "options": [
        { "label": "사전구매요청", "value": "advance_purchase" },
        { "label": "사후정산", "value": "post_settlement" },
        { "label": "지급요청", "value": "payment_request" }
      ]
    },
    {
      "name": "expenseDate",
      "label": "지출일자/구매예정일",
      "type": "date",
      "required": true
    },
    {
      "name": "budgetItem",
      "label": "예산항목/사업명",
      "type": "text",
      "required": true,
      "placeholder": "예: 사업비, 의료비, 입소 청소년 건강관리 사업"
    },
    {
      "name": "vendor",
      "label": "거래처",
      "type": "text",
      "required": true,
      "placeholder": "예: 청년약국"
    },
    {
      "name": "paymentMethod",
      "label": "결제수단",
      "type": "select",
      "required": true,
      "defaultValue": "corporate_card",
      "options": [
        { "label": "법인카드", "value": "corporate_card" },
        { "label": "개인카드", "value": "personal_card" },
        { "label": "계좌이체", "value": "bank_transfer" },
        { "label": "현금", "value": "cash" },
        { "label": "기타", "value": "other" }
      ]
    },
    {
      "name": "amount",
      "label": "지출금액",
      "type": "number",
      "required": true,
      "placeholder": "예: 68000"
    },
    {
      "name": "purpose",
      "label": "지출목적",
      "type": "textarea",
      "required": true,
      "placeholder": "구매 또는 지출이 필요한 이유를 입력하세요."
    },
    {
      "name": "details",
      "label": "세부내역",
      "type": "textarea",
      "required": true,
      "placeholder": "품명, 규격, 수량, 단가, 금액 등을 입력하세요.",
      "helpText": "영수증, 견적서, 사진 등 증빙자료는 첨부파일로 등록하세요."
    },
    {
      "name": "attachments",
      "label": "첨부파일",
      "type": "attachments",
      "required": false
    }
  ]
}
$schema$::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'template-expense-report';
