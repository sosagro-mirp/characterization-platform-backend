import { PartialType } from '@nestjs/swagger';
import { CreateConsentDocumentDto } from './create-consent-document.dto';

export class UpdateConsentDocumentDto extends PartialType(
  CreateConsentDocumentDto,
) {}
