import { Controller } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('')
export class CharacterCreationController {
  constructor(private readonly adminService: AdminService) {}
}
