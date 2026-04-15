import { PartialType } from '@nestjs/mapped-types';
import { CreateOptionQuestionDto } from './create-option-question.dto';

export class UpdateOptionQuestionDto extends PartialType(
  CreateOptionQuestionDto,
) {}
