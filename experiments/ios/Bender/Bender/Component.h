//
//  Component.h
//  Bender
//
//  Created by Julien Quint on 2/24/14.
//  Copyright (c) 2014 IGEL, Co., Ltd. All rights reserved.
//

#import <Foundation/Foundation.h>
#import "Node.h"

@class View;
@class Watch;

@interface Component : Node

@property (strong, nonatomic) Component *prototype;
@property (strong, nonatomic) NSDictionary *properties;
@property (strong, nonatomic) View *view;
@property (strong, nonatomic) NSArray *watches;

@end